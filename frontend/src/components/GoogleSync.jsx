import { useEffect, useState } from "react";
import {
  disconnectGoogle,
  getGoogleStatus,
  previewGoogleSync,
  startGoogleLogin,
  syncGoogle,
} from "../api/google";

function fmtWhen(ev) {
  const s = new Date(ev.start_time);
  const date = s.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
  if (ev.all_day) return `${date}　整天`;
  return `${date}　${s.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export default function GoogleSync({ onSynced }) {
  const [status, setStatus] = useState(null); // {configured, connected, email}
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");
  const [picker, setPicker] = useState(null); // { events, selected:Set } | null
  const [showPast, setShowPast] = useState(false); // 匯入視窗是否顯示過往行程

  async function refresh() {
    try {
      setStatus(await getGoogleStatus());
    } catch {
      setStatus({ configured: false, connected: false, email: "" });
    }
  }

  useEffect(() => {
    refresh();
    // OAuth 導回後顯示結果
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      setToast("已連接 Google 日曆！");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google") === "error") {
      setToast("連接失敗，請再試一次。");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // 按同步：先預覽有哪些新項目 → 有的話跳選單，沒有就直接套用（更新/推送）
  async function handleSync() {
    setSyncing(true);
    try {
      const { new_events } = await previewGoogleSync();
      if (new_events.length > 0) {
        setPicker({ events: new_events, selected: new Set(new_events.map((e) => e.google_event_id)) });
        setSyncing(false);
        return;
      }
      await applySync([]);
    } catch {
      setToast("同步失敗，請確認連線。");
      setSyncing(false);
    }
  }

  // selectedIds: 陣列（可空）
  async function applySync(selectedIds) {
    setSyncing(true);
    try {
      const r = await syncGoogle(selectedIds);
      setToast(
        `同步完成：新增 ${r.pulled_created} 筆、更新 ${r.pulled_updated} 筆、推送 ${r.pushed} 筆`
      );
      onSynced?.();
    } catch {
      setToast("同步失敗，請確認連線。");
    } finally {
      setSyncing(false);
      setPicker(null);
    }
  }

  function togglePick(id) {
    setPicker((p) => {
      const selected = new Set(p.selected);
      selected.has(id) ? selected.delete(id) : selected.add(id);
      return { ...p, selected };
    });
  }

  async function handleDisconnect() {
    if (!window.confirm("要中斷與 Google 日曆的連接嗎？（已同步的行程會保留）")) return;
    await disconnectGoogle();
    refresh();
  }

  if (!status) return null;

  return (
    <div className="relative flex items-center gap-2">
      {toast && (
        <span className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          {toast}
        </span>
      )}

      {!status.configured ? (
        <button
          onClick={() =>
            setToast("尚未設定 Google 金鑰，請看 backend/.env 與 README 的設定步驟。")
          }
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-400 shadow-sm"
          title="需要先在 backend/.env 填入 Google 金鑰"
        >
          🔗 Google（未設定）
        </button>
      ) : !status.connected ? (
        <button
          onClick={startGoogleLogin}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
        >
          🔗 連接 Google 日曆
        </button>
      ) : (
        <>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            title={`已連接：${status.email}`}
          >
            <span className={syncing ? "animate-spin" : ""}>↻</span>
            {syncing ? "同步中…" : "同步 Google"}
          </button>
          <button
            onClick={startGoogleLogin}
            className="rounded-lg px-2 text-xs font-semibold text-slate-400 transition hover:text-indigo-600"
            title="重新授權，更新權限（例如新增 Gmail 讀取，給訂閱掃描用）"
          >
            重新授權
          </button>
          <button
            onClick={handleDisconnect}
            className="rounded-lg px-1.5 text-slate-300 transition hover:text-red-500"
            title={`中斷連接（${status.email}）`}
          >
            ✕
          </button>
        </>
      )}

      {picker && (() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isFuture = (ev) => new Date(ev.start_time) >= todayStart;
        const visible = showPast ? picker.events : picker.events.filter(isFuture);
        const visibleIds = new Set(visible.map((e) => e.google_event_id));
        const visSel = [...picker.selected].filter((id) => visibleIds.has(id));
        const pastCount = picker.events.length - picker.events.filter(isFuture).length;
        const allVisSelected = visible.length > 0 && visible.every((e) => picker.selected.has(e.google_event_id));
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setPicker(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-black text-slate-900">從 Google 匯入行程</h2>
              <p className="mt-0.5 text-sm text-slate-400">
                有 {visible.length} 筆可匯入，勾選要匯入的。
                {!showPast && pastCount > 0 && `（已隱藏 ${pastCount} 筆過往行程）`}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-2">
              <button
                onClick={() =>
                  setPicker((p) => {
                    const selected = new Set(p.selected);
                    if (allVisSelected) visible.forEach((e) => selected.delete(e.google_event_id));
                    else visible.forEach((e) => selected.add(e.google_event_id));
                    return { ...p, selected };
                  })
                }
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                {allVisSelected ? "全部取消" : "全選"}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={showPast}
                  onChange={(e) => setShowPast(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
                />
                顯示過往日期
              </label>
              <span className="ml-auto text-xs text-slate-400">已選 {visSel.length} 筆</span>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
              {visible.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  沒有今天以後的新行程。勾「顯示過往日期」可看已過期的。
                </p>
              ) : (
                visible.map((ev) => {
                  const on = picker.selected.has(ev.google_event_id);
                  const past = !isFuture(ev);
                  return (
                    <label
                      key={ev.google_event_id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePick(ev.google_event_id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{ev.title}</p>
                        <p className={`text-xs ${past ? "text-rose-400" : "text-slate-400"}`}>
                          {fmtWhen(ev)}{past && "　·　已過期"}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setPicker(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={() => applySync(visSel)}
                disabled={syncing || visSel.length === 0}
                className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {syncing ? "匯入中…" : `匯入 ${visSel.length} 筆`}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
