import { useEffect, useState } from "react";
import { getCodexUsage, saveCodexSettings } from "../api/codex";

function windowLabel(sec) {
  if (!sec) return "";
  if (sec % 604800 === 0) return sec / 604800 === 1 ? "每週" : `每 ${sec / 604800} 週`;
  if (sec % 86400 === 0) return `每 ${sec / 86400} 天`;
  if (sec % 3600 === 0) return `每 ${sec / 3600} 小時`;
  if (sec % 60 === 0) return `每 ${sec / 60} 分`;
  return `每 ${sec} 秒`;
}

function fmtRemain(sec) {
  if (sec == null) return "—";
  if (sec <= 0) return "即將重置";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小時`;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分`;
}

function resetAtMs(win, fetchedAt) {
  if (!win) return null;
  if (win.reset_at) return win.reset_at * 1000;
  if (win.reset_after_seconds != null && fetchedAt) return (fetchedAt + win.reset_after_seconds) * 1000;
  return null;
}

function barColor(used) {
  if (used >= 90) return "bg-red-500";
  if (used >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function WindowBar({ title, win, fetchedAt, now }) {
  if (!win || win.used_percent == null) return null;
  const used = Math.round(win.used_percent);
  const remain = Math.max(0, 100 - used);
  const rMs = resetAtMs(win, fetchedAt);
  const remainSec = rMs ? Math.round((rMs - now) / 1000) : null;
  const label = windowLabel(win.window_seconds);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-slate-700">
          {title}
          {label && <span className="ml-1.5 text-xs font-normal text-slate-400">{label}</span>}
        </span>
        <span className="text-sm font-black text-slate-800">
          剩 {remain}%<span className="ml-1 text-xs font-normal text-slate-400">已用 {used}%</span>
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor(used)}`} style={{ width: `${Math.min(100, used)}%` }} />
      </div>
      {remainSec != null && (
        <p className="mt-1.5 text-xs text-slate-400">
          Reset 還有 <span className="font-medium text-slate-600">{fmtRemain(remainSec)}</span>
          {rMs && (
            <span className="ml-1">
              （{new Date(rMs).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function SetupForm({ onSaved }) {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    try {
      await saveCodexSettings({ access_token: token.trim(), account_id: account.trim() });
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">
        主機若有裝 Codex CLI（<code className="rounded bg-slate-200 px-1">~/.codex/auth.json</code>）會自動讀取。
        沒有的話，可手動貼上 ChatGPT access token：
      </p>
      <textarea
        className={field}
        rows={2}
        placeholder="access token（Bearer）"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <input
        className={field}
        placeholder="ChatGPT-Account-Id（可留空，會嘗試自動推得）"
        value={account}
        onChange={(e) => setAccount(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        disabled={!token.trim() || saving}
        className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 active:scale-95 disabled:opacity-40"
      >
        {saving ? "儲存中…" : "儲存並重新查詢"}
      </button>
    </div>
  );
}

export default function CodexUsage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [now, setNow] = useState(Date.now());

  function load() {
    setLoading(true);
    setErr("");
    getCodexUsage()
      .then((d) => {
        setData(d);
        setShowSetup(false);
      })
      .catch((e) => {
        setData(null);
        setErr(e?.response?.data?.detail || "查詢失敗");
        setShowSetup(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // 每 30 秒更新一次倒數
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h2 className="text-base font-black text-slate-900">Codex 用量</h2>
          {data?.plan_type && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600">
              {data.plan_type}
            </span>
          )}
          {data?.limit_reached && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">已達上限</span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          title="重新取得"
        >
          {loading ? "查詢中…" : "↻ 更新"}
        </button>
      </div>

      {data && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <WindowBar title="5 小時額度" win={data.primary} fetchedAt={data.fetched_at} now={now} />
          <WindowBar title="每週額度" win={data.secondary} fetchedAt={data.fetched_at} now={now} />
        </div>
      )}

      {data?.credits && (data.credits.balance != null || data.credits.has_credits != null) && (
        <p className="mt-2 text-xs text-slate-400">
          點數：
          {data.credits.unlimited
            ? "無限"
            : data.credits.balance != null
              ? data.credits.balance
              : data.credits.has_credits
                ? "有"
                : "無"}
        </p>
      )}

      {data && (
        <p className="mt-2 text-[11px] text-slate-400">
          來源：{data.source === "codex-cli" ? "Codex CLI 登入檔" : "手動 token"}
          {data.fetched_at && `　·　更新於 ${new Date(data.fetched_at * 1000).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`}
          <button onClick={() => setShowSetup((v) => !v)} className="ml-2 text-indigo-500 hover:underline">
            設定
          </button>
        </p>
      )}

      {err && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{err}</div>
      )}

      {showSetup && <SetupForm onSaved={load} />}
    </div>
  );
}
