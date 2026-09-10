import { useMemo, useState } from "react";

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const kfmt = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n)}`);
const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

function Donut({ segments, total, centerLabel }) {
  const size = 176;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {segments.map((s, i) => {
        const len = total > 0 ? (s.value / total) * C : 0;
        const el = (
          <circle
            key={s.name}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="46%" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>{centerLabel}</text>
      <text x="50%" y="60%" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 19, fontWeight: 800 }}>
        {money(total)}
      </text>
    </svg>
  );
}

export default function Analysis({ monthTxs = [], txs = [], categories = [], monthLabel, offset = 0, setOffset }) {
  const [kind, setKind] = useState("expense"); // 圓環看支出 or 收入
  const emojiOf = (name) =>
    categories.find((c) => c.name === name && c.kind === kind && !c.parent_id)?.emoji ||
    (kind === "income" ? "💵" : "📦");

  const monthExpense = monthTxs.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  const monthIncome = monthTxs.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);

  // 分類圓環（依 kind）
  const segments = useMemo(() => {
    const m = {};
    for (const t of monthTxs) if (t.kind === kind) m[t.category] = (m[t.category] || 0) + t.amount;
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTxs, kind]);
  const total = segments.reduce((s, x) => s + x.value, 0);

  // 6 個月趨勢（結束在目前選的月份）
  const trend = useMemo(() => {
    const now = new Date();
    const baseY = now.getFullYear();
    const baseM = now.getMonth() + offset;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(baseY, baseM - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const off = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
      months.push({ ym, label: `${d.getMonth() + 1}月`, expense: 0, income: 0, off });
    }
    const idx = Object.fromEntries(months.map((m, i) => [m.ym, i]));
    for (const t of txs) {
      const ym = String(t.date || "").slice(0, 7);
      if (ym in idx) {
        if (t.kind === "expense") months[idx[ym]].expense += t.amount;
        else if (t.kind === "income") months[idx[ym]].income += t.amount;
      }
    }
    return months;
  }, [txs, offset]);
  const trendMax = Math.max(1, ...trend.map((m) => Math.max(m.expense, m.income)));

  const navBtn = "flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700";
  const kindTint = kind === "income" ? "text-emerald-600" : "text-rose-600";

  return (
    <div className="space-y-4">
      {/* 月份切換 + 支出/收入切換 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset?.((o) => o - 1)} className={navBtn}>‹</button>
          <span className="min-w-[7rem] text-center text-sm font-black text-slate-800">{monthLabel}</span>
          <button onClick={() => setOffset?.((o) => o + 1)} className={navBtn}>›</button>
          {offset !== 0 && (
            <button onClick={() => setOffset?.(0)} className="ml-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-100">今天</button>
          )}
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {[["expense", "支出"], ["income", "收入"]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 transition ${kind === k ? `bg-white shadow-sm ${k === "income" ? "text-emerald-600" : "text-rose-600"}` : "text-slate-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* 收支結餘摘要 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-xs text-slate-400">支出</p>
          <p className="text-lg font-black text-rose-500">{money(monthExpense)}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-xs text-slate-400">收入</p>
          <p className="text-lg font-black text-emerald-500">{money(monthIncome)}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-xs text-slate-400">結餘</p>
          <p className={`text-lg font-black ${monthIncome - monthExpense >= 0 ? "text-slate-800" : "text-rose-500"}`}>{money(monthIncome - monthExpense)}</p>
        </div>
      </div>

      {/* 分類圓環 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <p className="mb-3 text-sm font-black text-slate-700">{monthLabel} {kind === "income" ? "收入" : "支出"}分佈</p>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">這個月還沒有{kind === "income" ? "收入" : "支出"}。</p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Donut segments={segments} total={total} centerLabel={kind === "income" ? "本月收入" : "本月支出"} />
            <div className="w-full flex-1 space-y-2">
              {segments.map((s, i) => {
                const pct = Math.round((s.value / total) * 100);
                return (
                  <div key={s.name}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 truncate text-slate-600">{emojiOf(s.name)} {s.name}</span>
                      <span className={`font-semibold ${kindTint}`}>{money(s.value)}</span>
                      <span className="w-9 text-right text-xs text-slate-400">{pct}%</span>
                    </div>
                    <div className="ml-5 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 近 6 個月趨勢（點長條可切月，當月會 highlight） */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-black text-slate-700">近 6 個月</p>
          <div className="flex gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />支出</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />收入</span>
          </div>
        </div>
        <div className="flex items-stretch gap-1.5" style={{ height: 180 }}>
          {trend.map((m) => {
            const sel = m.off === offset;
            return (
              <button
                key={m.ym}
                onClick={() => setOffset?.(m.off)}
                className={`flex flex-1 flex-col items-center rounded-lg pt-1 transition ${sel ? "bg-indigo-50 ring-1 ring-indigo-100" : "hover:bg-slate-50"}`}
                title={`支出 ${money(m.expense)}｜收入 ${money(m.income)}`}
              >
                <div className="flex w-full flex-1 items-end justify-center gap-1 px-1">
                  <div className="w-1/2 rounded-t bg-rose-400" style={{ height: `${(m.expense / trendMax) * 100}%` }} />
                  <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: `${(m.income / trendMax) * 100}%` }} />
                </div>
                <span className={`mt-1 text-[11px] ${sel ? "font-bold text-indigo-600" : "text-slate-400"}`}>{m.label}</span>
                <span className="text-[10px] font-semibold text-slate-500">{kfmt(m.expense)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">點長條可切換到該月份</p>
      </div>
    </div>
  );
}
