import { useEffect, useState } from "react";
import { getCodexUsage } from "../api/codex";
import { getClaudeUsage } from "../api/claudeUsage";

function fmtRemain(sec) {
  if (sec == null) return "";
  if (sec <= 0) return "即將重置";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h}小時`;
  if (h > 0) return `${h}小時${m}分`;
  return `${m}分`;
}

function barColor(used) {
  if (used >= 90) return "bg-red-500";
  if (used >= 70) return "bg-amber-400";
  return "bg-emerald-400";
}

function Line({ label, used, resetMs, now }) {
  if (used == null) return null;
  const u = Math.round(used);
  const remain = Math.max(0, 100 - u);
  const rs = resetMs ? Math.round((resetMs - now) / 1000) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-slate-200">剩 {remain}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${barColor(u)}`} style={{ width: `${Math.min(100, u)}%` }} />
      </div>
      {rs != null && <p className="mt-0.5 text-[10px] text-slate-500">reset {fmtRemain(rs)}</p>}
    </div>
  );
}

function Block({ emoji, name, plan, lines, loading, err, now, onReload }) {
  return (
    <div className="rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-bold text-slate-200">
          {emoji} {name}
        </span>
        {plan && (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{plan}</span>
        )}
        <button
          onClick={onReload}
          disabled={loading}
          className="ml-auto text-[11px] text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
          title="重新取得"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>
      {err ? (
        <p className="text-[10px] leading-snug text-slate-500">{err}</p>
      ) : lines.length === 0 ? (
        <p className="text-[10px] text-slate-500">載入中…</p>
      ) : (
        <div className="space-y-1.5">{lines}</div>
      )}
    </div>
  );
}

function resetMsCodex(win, fetchedAt) {
  if (!win) return null;
  if (win.reset_at) return win.reset_at * 1000;
  if (win.reset_after_seconds != null && fetchedAt) return (fetchedAt + win.reset_after_seconds) * 1000;
  return null;
}

export default function SidebarUsage() {
  const [codex, setCodex] = useState(null);
  const [codexErr, setCodexErr] = useState("");
  const [codexLoading, setCodexLoading] = useState(true);
  const [claude, setClaude] = useState(null);
  const [claudeErr, setClaudeErr] = useState("");
  const [claudeLoading, setClaudeLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // 失敗時自動再試一次（tunnel 偶爾閃斷）
  function loadCodex(retried = false) {
    setCodexLoading(true);
    setCodexErr("");
    getCodexUsage()
      .then(setCodex)
      .catch((e) => {
        if (!retried && isTransient(e)) {
          setTimeout(() => loadCodex(true), 4000);
          return;
        }
        setCodex(null);
        setCodexErr(errText(e));
      })
      .finally(() => setCodexLoading(false));
  }
  function loadClaude(retried = false) {
    setClaudeLoading(true);
    setClaudeErr("");
    getClaudeUsage()
      .then(setClaude)
      .catch((e) => {
        if (!retried && isTransient(e)) {
          setTimeout(() => loadClaude(true), 4000);
          return;
        }
        setClaude(null);
        setClaudeErr(errText(e));
      })
      .finally(() => setClaudeLoading(false));
  }

  useEffect(() => {
    loadCodex();
    loadClaude();
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const codexLines = codex
    ? [
        <Line key="p" label="5 小時" used={codex.primary?.used_percent} resetMs={resetMsCodex(codex.primary, codex.fetched_at)} now={now} />,
        <Line key="s" label="每週" used={codex.secondary?.used_percent} resetMs={resetMsCodex(codex.secondary, codex.fetched_at)} now={now} />,
      ].filter((l) => l.props.used != null)
    : [];

  const claudeLines = claude
    ? (claude.windows ?? [])
        .map((w) => <Line key={w.key} label={w.label} used={w.used_percent} resetMs={w.resets_at} now={now} />)
        .filter((l) => l.props.used != null)
    : [];

  return (
    <div className="space-y-2 px-3 pt-3">
      <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">AI 用量</p>
      <Block
        emoji="🤖"
        name="Codex"
        plan={codex?.plan_type}
        lines={codexLines}
        loading={codexLoading}
        err={codexErr}
        now={now}
        onReload={() => loadCodex()}
      />
      <Block
        emoji="✳️"
        name="Claude"
        plan={claude?.subscription_type}
        lines={claudeLines}
        loading={claudeLoading}
        err={claudeErr}
        now={now}
        onReload={() => loadClaude()}
      />
    </div>
  );
}

function isTransient(e) {
  const st = e?.response?.status;
  return !e?.response || st >= 500;
}

function errText(e) {
  const status = e?.response?.status;
  const msg = String(e?.response?.data?.detail || e?.message || "");
  // Cloudflare tunnel / 網路層的錯（主機這次沒正常回應），不是 Claude/Codex 本身
  if (!e?.response || /origin web server|cloudflare|network error|timeout/i.test(msg) || [520, 521, 522, 523, 524, 530].includes(status)) {
    return "連線暫時中斷，按 ↻ 重試";
  }
  if (msg.includes("找不到")) return "未連結（無登入檔）";
  if (msg.includes("登入已過期")) return "登入過期：到主機執行一次 claude";
  if (msg.includes("過期")) return "token 過期：主機重新登入一次";
  if (msg.includes("限流")) return "限流中，稍後再試";
  if (!msg) return status ? `錯誤 ${status}` : "查詢失敗";
  return msg.length > 40 ? msg.slice(0, 40) + "…" : msg;
}
