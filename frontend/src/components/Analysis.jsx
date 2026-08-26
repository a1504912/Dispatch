import { useMemo } from "react";

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

function Donut({ segments, total }) {
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
      <text x="50%" y="46%" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>本月支出</text>
      <text x="50%" y="60%" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 19, fontWeight: 800 }}>
        {money(total)}
      </text>
    </svg>
  );
}

export default function Analysis({ monthTxs = [], txs = [], categories = [], monthLabel }) {
  const emojiOf = (name) =>
    categories.find((c) => c.name === name && c.kind === "expense" && !c.parent_id)?.emoji || "📦";

  // 本月分類圓環
  const segments = useMemo(() => {
    const m = {};
    for (const t of monthTxs) if (t.kind === "expense") m[t.category] = (m[t.category] || 0) + t.amount;
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTxs]);
  const total = segments.reduce((s, x) => s + x.value, 0);

  // 近 6 個月趨勢
  const trend = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ ym, label: `${d.getMonth() + 1}月`, expense: 0, income: 0 });
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
  }, [txs]);
  const trendMax = Math.max(1, ...trend.map((m) => Math.max(m.expense, m.income)));

  return (
    <div className="space-y-5">
      {/* 分類圓環 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-black text-slate-700">{monthLabel} 支出分佈</p>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">這個月還沒有支出。</p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Donut segments={segments} total={total} />
            <div className="w-full flex-1 space-y-1.5">
              {segments.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 truncate text-slate-600">{emojiOf(s.name)} {s.name}</span>
                  <span className="font-semibold text-slate-700">{money(s.value)}</span>
                  <span className="w-10 text-right text-xs text-slate-400">{Math.round((s.value / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 近半年趨勢 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-black text-slate-700">近 6 個月</p>
          <div className="flex gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" />支出</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />收入</span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
          {trend.map((m) => (
            <div key={m.ym} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-full w-full items-end justify-center gap-1">
                <div
                  className="w-1/2 rounded-t bg-red-400"
                  style={{ height: `${(m.expense / trendMax) * 100}%` }}
                  title={`支出 ${money(m.expense)}`}
                />
                <div
                  className="w-1/2 rounded-t bg-emerald-400"
                  style={{ height: `${(m.income / trendMax) * 100}%` }}
                  title={`收入 ${money(m.income)}`}
                />
              </div>
              <span className="text-[11px] text-slate-400">{m.label}</span>
              <span className="text-[10px] font-semibold text-slate-500">{m.expense >= 1000 ? `${Math.round(m.expense / 100) / 10}k` : Math.round(m.expense)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
