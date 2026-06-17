import { useEffect, useState } from "react";
import {
  disconnectGoogle,
  getGoogleStatus,
  startGoogleLogin,
  syncGoogle,
} from "../api/google";

export default function GoogleSync({ onSynced }) {
  const [status, setStatus] = useState(null); // {configured, connected, email}
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");

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

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncGoogle();
      setToast(
        `同步完成：拉入 ${r.pulled_created} 筆、更新 ${r.pulled_updated} 筆、推送 ${r.pushed} 筆`
      );
      onSynced?.();
    } catch {
      setToast("同步失敗，請確認連線。");
    } finally {
      setSyncing(false);
    }
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
            onClick={handleDisconnect}
            className="rounded-lg px-1.5 text-slate-300 transition hover:text-red-500"
            title={`中斷連接（${status.email}）`}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
