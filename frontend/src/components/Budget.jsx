import { useMemo, useState } from "react";
import { setBudget, deleteBudget } from "../api/budgets";

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

function Bar({ spent, amount }) {
  const pct = amount > 0 ? Math.min((spent / amount) * 100, 100) : 0;
  const over = spent > amount;
  const near = !over && spent >= amount * 0.8;
  const color = over ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Budget({ budgets = [], monthTxs = [], categories = [], monthLabel, onChanged }) {
  const [overallInput, setOverallInput] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newAmt, setNewAmt] = useState("");

  const expense = monthTxs.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  const byCat = useMemo(() => {
    const m = {};
    for (const t of monthTxs) if (t.kind === "expense") m[t.category] = (m[t.category] || 0) + t.amount;
    return m;
  }, [monthTxs]);

  const overall = budgets.find((b) => b.category === "");
  const catBudgets = budgets.filter((b) => b.category !== "");
  const emojiOf = (name) => categories.find((c) => c.name === name && c.kind === "expense" && !c.parent_id)?.emoji || "📦";

  const topCats = categories.filter((c) => c.kind === "expense" && !c.parent_id);
  const budgetableCats = topCats.filter((c) => !catBudgets.some((b) => b.category === c.name));

  async function saveOverall() {
    const amt = Number(overallInput);
    if (!amt || amt <= 0) return;
    await setBudget("", amt);
    setOverallInput("");
    onChanged?.();
  }
  async function addCatBudget() {
    const amt = Number(newAmt);
    if (!newCat || !amt || amt <= 0) return;
    await setBudget(newCat, amt);
    setNewCat("");
    setNewAmt("");
    onChanged?.();
  }

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">{monthLabel} 的預算與花費</p>

      {/* 總預算 */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-slate-700">每月總預算</p>
          {overall && (
            <button onClick={() => deleteBudget(overall.id).then(onChanged)} className="text-xs text-slate-300 hover:text-red-500">移除</button>
          )}
        </div>
        {overall ? (
          <>
            <div className="mt-2 flex items-end justify-between">
              <span className={`text-2xl font-black ${expense > overall.amount ? "text-red-500" : "text-slate-900"}`}>{money(expense)}</span>
              <span className="text-sm text-slate-400">/ {money(overall.amount)}</span>
            </div>
            <Bar spent={expense} amount={overall.amount} />
            <p className="mt-1.5 text-xs">
              {expense > overall.amount ? (
                <span className="font-bold text-red-500">超出 {money(expense - overall.amount)}</span>
              ) : (
                <span className="text-slate-500">還可花 {money(overall.amount - expense)}</span>
              )}
            </p>
            <div className="mt-3 flex gap-2">
              <input type="number" value={overallInput} onChange={(e) => setOverallInput(e.target.value)} placeholder={`改預算（現為 ${money(overall.amount)}）`} className={`${field} flex-1`} />
              <button onClick={saveOverall} disabled={!Number(overallInput)} className="rounded-xl bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-40">更新</button>
            </div>
          </>
        ) : (
          <div className="mt-3 flex gap-2">
            <input type="number" value={overallInput} onChange={(e) => setOverallInput(e.target.value)} placeholder="設定每月總預算" className={`${field} flex-1`} />
            <button onClick={saveOverall} disabled={!Number(overallInput)} className="rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40">設定</button>
          </div>
        )}
      </div>

      {/* 分類預算 */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-5 shadow-sm">
        <p className="mb-3 text-sm font-black text-slate-700">分類預算</p>
        <div className="space-y-3">
          {catBudgets.map((b) => {
            const spent = byCat[b.category] || 0;
            return (
              <div key={b.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{emojiOf(b.category)} {b.category}</span>
                  <span className="flex items-center gap-2">
                    <span className={spent > b.amount ? "font-bold text-red-500" : "text-slate-500"}>{money(spent)} / {money(b.amount)}</span>
                    <button onClick={() => deleteBudget(b.id).then(onChanged)} className="text-xs text-slate-300 hover:text-red-500">✕</button>
                  </span>
                </div>
                <Bar spent={spent} amount={b.amount} />
              </div>
            );
          })}
          {catBudgets.length === 0 && <p className="text-sm text-slate-400">還沒有分類預算。可以幫特定分類(例如飲食)設上限。</p>}
        </div>

        {/* 新增分類預算 */}
        {budgetableCats.length > 0 && (
          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className={`${field} flex-1`}>
              <option value="">選分類…</option>
              {budgetableCats.map((c) => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
            </select>
            <input type="number" value={newAmt} onChange={(e) => setNewAmt(e.target.value)} placeholder="上限" className={`${field} w-28`} />
            <button onClick={addCatBudget} disabled={!newCat || !Number(newAmt)} className="rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40">＋</button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">超過預算時，會自動推播提醒到你的裝置（每月每項提醒一次）。</p>
    </div>
  );
}
