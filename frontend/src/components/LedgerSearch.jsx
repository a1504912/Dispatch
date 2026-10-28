import { useMemo, useState } from "react";

// 記帳搜尋：關鍵字（備註、分類、帳戶）、收支、分類／次分類、金額範圍、日期範圍、帳戶；搜全部月份
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const KIND_LABEL = { expense: "支出", income: "收入", transfer: "轉帳", adjust: "校正" };

function rangeOf(key) {
  const t = new Date();
  if (key === "month") return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)];
  if (key === "3m") return [iso(new Date(t.getFullYear(), t.getMonth() - 2, 1)), iso(t)];
  if (key === "year") return [`${t.getFullYear()}-01-01`, iso(t)];
  return ["", ""];
}

export default function LedgerSearch({ open, txs, categories, accounts, accLabel, emojiOf, onClose, onOpenTx }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [acc, setAcc] = useState("");
  const [limit, setLimit] = useState(200);

  const tops = categories.filter((c) => !c.parent_id && (kind === "all" || c.kind === kind));
  const catNames = [...new Set([
    ...tops.map((c) => c.name),
    ...txs.filter((t) => t.category && (kind === "all" || t.kind === kind)).map((t) => t.category),
  ])];
  // 次分類：分類設定裡有的＋記錄裡實際用過的（舊分類改名或刪掉的也找得到）
  const subs = cat
    ? [...new Set([
        ...categories.filter((c) => c.parent_id && tops.some((t) => t.id === c.parent_id && t.name === cat)).map((c) => c.name),
        ...txs.filter((t) => t.category === cat && t.subcategory).map((t) => t.subcategory),
      ])]
    : [];
  const usable = accounts.filter((a) => a.parent_id || !accounts.some((x) => x.parent_id === a.id));

  const result = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const lo = minAmt === "" ? null : Number(minAmt);
    const hi = maxAmt === "" ? null : Number(maxAmt);
    return txs
      .filter((t) => {
        if (kind !== "all" && t.kind !== kind) return false;
        if (cat && t.category !== cat) return false;
        if (sub && t.subcategory !== sub) return false;
        const a = Math.abs(Number(t.amount) || 0);
        if (lo != null && a < lo) return false;
        if (hi != null && a > hi) return false;
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (acc && t.account_id !== Number(acc) && t.to_account_id !== Number(acc)) return false;
        if (words.length) {
          const text = [t.note, t.category, t.subcategory, accLabel(t), KIND_LABEL[t.kind], String(Math.abs(t.amount))].join(" ").toLowerCase();
          if (!words.every((w) => text.includes(w))) return false;
        }
        return true;
      })
      .sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
  }, [txs, q, kind, cat, sub, minAmt, maxAmt, from, to, acc, accLabel]);

  if (!open) return null;

  // 支出負數（退款／沖銷）會從支出扣掉
  const expense = result.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const income = result.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const filtered = q || kind !== "all" || cat || minAmt !== "" || maxAmt !== "" || from || to || acc;
  const clear = () => {
    setQ(""); setKind("all"); setCat(""); setSub(""); setMinAmt(""); setMaxAmt(""); setFrom(""); setTo(""); setAcc("");
  };
  const field = "w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400 focus:bg-white";
  const chip = (on) => `rounded-full px-3 py-1 text-xs font-semibold transition ${on ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-700"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[86vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-lg font-black text-slate-900">🔍 搜尋記錄</h2>
          {filtered && <button onClick={clear} className="text-xs font-semibold text-slate-400 hover:text-rose-500">清除條件</button>}
          <button onClick={onClose} className="ml-auto rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-2.5 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="關鍵字：備註、店家、分類、帳戶、金額…（空白分隔可多個）" className={`${field} bg-white py-2`} />
          <div className="flex flex-wrap gap-1.5">
            {[["all", "全部"], ["expense", "支出"], ["income", "收入"], ["transfer", "轉帳"]].map(([k, l]) => (
              <button key={k} onClick={() => { setKind(k); setCat(""); setSub(""); }} className={chip(kind === k)}>{l}</button>
            ))}
            <span className="mx-1 w-px bg-slate-200" />
            {[["month", "本月"], ["3m", "近 3 個月"], ["year", "今年"], ["all", "不限日期"]].map(([k, l]) => {
              const [f, t] = rangeOf(k);
              return <button key={k} onClick={() => { setFrom(f); setTo(t); }} className={chip(from === f && to === t)}>{l}</button>;
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select value={cat} onChange={(e) => { setCat(e.target.value); setSub(""); }} className={field}>
              <option value="">所有分類</option>
              {catNames.map((n) => <option key={n} value={n}>{tops.find((c) => c.name === n)?.emoji} {n}</option>)}
            </select>
            <select value={sub} onChange={(e) => setSub(e.target.value)} disabled={!subs.length} className={`${field} disabled:opacity-40`}>
              <option value="">所有次分類</option>
              {subs.map((n) => <option key={n}>{n}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input type="number" inputMode="decimal" min="0" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="最低金額" className={field} />
              <span className="text-slate-300">～</span>
              <input type="number" inputMode="decimal" min="0" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} placeholder="最高" className={field} />
            </div>
            <select value={acc} onChange={(e) => setAcc(e.target.value)} className={field}>
              <option value="">所有帳戶</option>
              {usable.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="shrink-0">日期</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} sm:w-44`} />
            <span className="shrink-0">～</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} sm:w-44`} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-xs text-slate-500">
          <span>找到 <b className="text-slate-800">{result.length}</b> 筆</span>
          {expense !== 0 && <span>支出 <b className="text-rose-600">{money(expense)}</b></span>}
          {income !== 0 && <span>收入 <b className="text-emerald-600">{money(income)}</b></span>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {result.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">沒有符合的記錄</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {result.slice(0, limit).map((t) => {
                const neg = (t.kind === "expense" && t.amount >= 0) || (t.kind === "adjust" && t.amount < 0);
                const pos = t.kind === "income" || (t.kind === "expense" && t.amount < 0) || (t.kind === "adjust" && t.amount >= 0);
                return (
                  <li key={t.id}>
                    <button onClick={() => onOpenTx(t)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50">
                      <span className="w-[4.5rem] shrink-0 text-xs text-slate-400">{t.date.slice(0, 4) === String(new Date().getFullYear()) ? t.date.slice(5).replace("-", "/") : t.date.replaceAll("-", "/")}</span>
                      <span className="text-lg">{t.kind === "transfer" ? "🔁" : t.kind === "adjust" ? "🔧" : emojiOf(t.kind, t.category)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {t.kind === "transfer" ? "轉帳" : t.kind === "adjust" ? "餘額校正" : t.category}
                          {t.subcategory && <span className="font-normal text-slate-400"> · {t.subcategory}</span>}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{[accLabel(t), t.note].filter(Boolean).join("　·　")}</span>
                      </span>
                      <span className={`shrink-0 text-sm font-black tabular-nums ${pos ? "text-emerald-500" : neg ? "text-slate-800" : "text-sky-500"}`}>
                        {pos ? "+" : neg ? "−" : ""}{money(Math.abs(t.amount))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {result.length > limit && (
            <button onClick={() => setLimit((l) => l + 200)} className="mt-2 w-full rounded-xl py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">顯示更多（還有 {result.length - limit} 筆）</button>
          )}
        </div>
      </div>
    </div>
  );
}
