import { useMemo, useState } from "react";
import {
  addMonths,
  cardAccounts,
  cardStatements,
  currentMonthKey,
  fmtMD,
  fmtMonth,
  statementKeyOf,
} from "../cardBill";

const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const SHOW_MONTHS = 6; // 從這個月起往後看幾個月

function txTitle(t) {
  const cat = [t.category, t.subcategory].filter(Boolean).join("・");
  return t.note ? `${cat}｜${t.note}` : cat || (t.kind === "transfer" ? "轉出" : "—");
}

// 結帳日／繳款日設定
function DaySelect({ value, onChange, zeroLabel }) {
  return (
    <select
      value={value || 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs"
    >
      <option value={0}>{zeroLabel}</option>
      {Array.from({ length: 31 }, (_, i) => (
        <option key={i + 1} value={i + 1}>{i + 1} 日</option>
      ))}
    </select>
  );
}

export default function CardBills({ accounts, txs, onSaveCard }) {
  const cards = useMemo(() => cardAccounts(accounts), [accounts]);
  const now = currentMonthKey();
  const months = Array.from({ length: SHOW_MONTHS }, (_, i) => addMonths(now, i));
  const [open, setOpen] = useState(null); // 展開明細：`${cardId}:${key}`
  const [showSettings, setShowSettings] = useState(false);

  const data = useMemo(
    () =>
      cards.map((c) => {
        const all = cardStatements(c, txs);
        const upcoming = all.filter((s) => s.payMonth >= now && s.payMonth < addMonths(now, SHOW_MONTHS));
        const later = all
          .filter((s) => s.payMonth >= addMonths(now, SHOW_MONTHS))
          .reduce((x, s) => x + s.amount, 0);
        return { card: c, upcoming, later };
      }),
    [cards, txs, now]
  );

  if (!cards.length) return null;

  // 各月份合計（所有卡）
  const totals = months.map((m) => {
    let amount = 0;
    let paid = 0;
    let accum = false;
    for (const d of data)
      for (const s of d.upcoming)
        if (s.payMonth === m) {
          amount += s.amount;
          paid += s.paid;
          if (s.close >= new Date(new Date().toDateString())) accum = true;
        }
    return { m, amount, paid, open: accum };
  });
  const thisM = totals[0];
  const nextM = totals[1];
  const laterTotal = totals.slice(2).reduce((x, t) => x + t.amount, 0) + data.reduce((x, d) => x + d.later, 0);
  const today = new Date(new Date().toDateString());
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-slate-800">💳 信用卡帳單預估</h3>
        <button onClick={() => setShowSettings((v) => !v)} className="text-xs text-slate-400 hover:text-indigo-600">
          {showSettings ? "收起設定" : "⚙ 結帳日／繳款日"}
        </button>
      </div>

      {showSettings && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-2.5">
          {cards.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="min-w-[6rem] font-semibold text-slate-700">{c.name}</span>
              <span className="flex items-center gap-1">
                結帳日 <DaySelect value={c.card_close_day} zeroLabel="月底" onChange={(v) => onSaveCard(c, { card_close_day: v })} />
              </span>
              <span className="flex items-center gap-1">
                繳款日 <DaySelect value={c.card_due_day} zeroLabel="不確定" onChange={(v) => onSaveCard(c, { card_due_day: v })} />
              </span>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">看信用卡帳單上的「結帳日」「繳款截止日」填；沒填就當每月月底結帳、隔月繳。</p>
        </div>
      )}

      {/* 重點：這個月、下個月要繳多少 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          [thisM, "這個月要繳"],
          [nextM, "下個月要繳"],
        ].map(([t, label]) => (
          <div key={t.m} className={`rounded-xl p-3 ${label === "下個月要繳" ? "bg-indigo-50 ring-1 ring-indigo-100" : "bg-slate-50"}`}>
            <p className="text-[11px] font-semibold text-slate-500">
              {label}（{fmtMonth(t.m)}）{t.open && <span className="ml-1 inline-block whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] text-amber-700">還在累積</span>}
            </p>
            <p className={`mt-0.5 text-2xl font-black tabular-nums ${label === "下個月要繳" ? "text-indigo-700" : "text-slate-800"}`}>{money(t.amount)}</p>
            {t.paid > 0 && (
              <p className="text-[11px] text-emerald-600">
                已繳 {money(t.paid)}{t.amount - t.paid > 0 ? `・還差 ${money(t.amount - t.paid)}` : "・繳清 ✓"}
              </p>
            )}
          </div>
        ))}
      </div>
      {laterTotal > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          之後的分期還有 <b className="text-slate-700">{money(laterTotal)}</b>：
          {totals.slice(2).filter((t) => t.amount).map((t) => `${fmtMonth(t.m)} ${money(t.amount)}`).join("、")}
          {data.some((d) => d.later) ? "…" : ""}
        </p>
      )}

      {/* 每張卡、每一期 */}
      <div className="mt-3 space-y-2">
        {data.map(({ card, upcoming }) => (
          <div key={card.id} className="rounded-xl ring-1 ring-slate-100">
            <p className="flex items-center justify-between px-3 pt-2 text-xs font-bold text-slate-600">
              <span>{card.emoji} {card.name}</span>
              <span className="font-normal text-slate-400">
                {card.card_close_day ? `${card.card_close_day} 日結帳` : "月底結帳"}
                {card.card_due_day ? `・${card.card_due_day} 日繳款` : ""}
              </span>
            </p>
            {upcoming.length === 0 && <p className="px-3 pb-2 pt-1 text-xs text-slate-300">這陣子沒有要繳的</p>}
            <ul className="divide-y divide-slate-50 px-1 pb-1">
              {upcoming.map((s) => {
                const key = `${card.id}:${s.key}`;
                const isOpen = open === key;
                const accumulating = s.close >= today;
                // 比目前這期還後面的帳單：裡面只會有已經排好的分期
                const future = s.key > statementKeyOf(todayStr, card.card_close_day);
                return (
                  <li key={s.key}>
                    <button onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50">
                      <span className={`shrink-0 text-slate-300 transition ${isOpen ? "rotate-90" : ""}`}>▸</span>
                      <span className="min-w-0 flex-1 text-slate-600">
                        <b className="text-slate-800">{fmtMonth(s.payMonth)}繳</b>
                        <span className="ml-1.5 text-slate-400">
                          {fmtMD(s.close)} 結帳{s.due ? `・${fmtMD(s.due)} 前繳` : ""}
                        </span>
                        {accumulating ? (
                          <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-600">{future ? "已排分期" : "還在累積"}</span>
                        ) : s.paid >= s.amount && s.amount > 0 ? (
                          <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-600">已繳清</span>
                        ) : (
                          <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">已結帳</span>
                        )}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-800">{money(s.amount)}</span>
                    </button>
                    {isOpen && (
                      <ul className="mb-1 ml-6 mr-2 space-y-0.5 border-l-2 border-slate-100 pl-2">
                        {s.items
                          .slice()
                          .sort((a, b) => String(a.tx.date).localeCompare(String(b.tx.date)))
                          .map((it, i) => (
                            <li key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                              <span className="w-10 shrink-0 tabular-nums text-slate-400">{String(it.tx.date).slice(5).replace("-", "/")}</span>
                              <span className="min-w-0 flex-1 truncate">{txTitle(it.tx)}</span>
                              {it.n > 1 && <span className="shrink-0 rounded bg-indigo-50 px-1 font-semibold text-indigo-600">分期 {it.k}/{it.n}</span>}
                              <span className={`shrink-0 tabular-nums ${it.amount < 0 ? "text-emerald-600" : "text-slate-700"}`}>{money(it.amount)}</span>
                            </li>
                          ))}
                        {s.paid > 0 && (
                          <li className="text-[11px] text-emerald-600">已繳 {money(s.paid)}</li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        依這張卡的記帳算：分期的在記帳時選「分幾期」就會自動拆到之後每個月；退款會扣掉。
        繳卡費記成「轉帳 → 轉入信用卡」，這裡就會顯示已繳。
      </p>
    </div>
  );
}
