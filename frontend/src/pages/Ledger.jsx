import { useEffect, useMemo, useState } from "react";
import { listTransactions, deleteTransaction } from "../api/ledger";
import { listLedgerCategories } from "../api/ledgerCategories";
import { listBudgets } from "../api/budgets";
import Budget from "../components/Budget.jsx";
import Analysis from "../components/Analysis.jsx";
import LedgerCategoryManager from "../components/LedgerCategoryManager.jsx";
import SplitBills from "../components/SplitBills.jsx";
import Assets from "../components/Assets.jsx";
import TransactionModal from "../components/TransactionModal.jsx";

const emojiFrom = (cats, kind, name) =>
  cats.find((c) => c.kind === kind && c.name === name)?.emoji ||
  (kind === "income" ? "💵" : "📦");

const pad2 = (n) => String(n).padStart(2, "0");
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

export default function Ledger() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0); // 0 = 本月
  const [allCats, setAllCats] = useState([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [tab, setTab] = useState("records"); // records（記錄）/ split（分帳）
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [budgets, setBudgets] = useState([]);

  function load() {
    setLoading(true);
    listTransactions()
      .then(setTxs)
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }
  function loadCats() {
    listLedgerCategories()
      .then(setAllCats)
      .catch(() => setAllCats([]));
  }
  function loadBudgets() {
    listBudgets()
      .then(setBudgets)
      .catch(() => setBudgets([]));
  }
  useEffect(() => {
    load();
    loadCats();
    loadBudgets();
  }, []);

  // 目前選到的年月
  const base = new Date();
  const cur = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const curYM = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`;
  const monthLabel = `${cur.getFullYear()} 年 ${cur.getMonth() + 1} 月`;

  const monthTxs = useMemo(
    () => txs.filter((t) => (t.date || "").startsWith(curYM)),
    [txs, curYM]
  );

  const expense = monthTxs.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  const income = monthTxs.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  // 支出分類統計（由多到少）
  const byCat = useMemo(() => {
    const map = {};
    for (const t of monthTxs) {
      if (t.kind !== "expense") continue;
      map[t.category] = (map[t.category] || 0) + t.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthTxs]);

  // 依日期分組
  const grouped = useMemo(() => {
    const g = {};
    for (const t of monthTxs) (g[t.date] ??= []).push(t);
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthTxs]);

  function startEdit(t) {
    setEditingTx(t);
    setTxModalOpen(true);
  }

  async function handleDelete(t) {
    if (!window.confirm("刪除這筆記錄？")) return;
    await deleteTransaction(t.id);
    load();
  }

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">記帳</h1>
        <p className="mt-1 text-sm text-slate-500">記錄每天的收支，看看錢都花到哪去了。</p>
      </div>

      {/* 分頁：記錄 / 分帳 / 預算 / 資產 / 分析 */}
      <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm font-medium">
        <button
          onClick={() => setTab("records")}
          className={`shrink-0 rounded-lg px-4 py-1.5 transition ${
            tab === "records" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📒 記錄
        </button>
        <button
          onClick={() => setTab("split")}
          className={`shrink-0 rounded-lg px-4 py-1.5 transition ${
            tab === "split" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🧾 分帳
        </button>
        <button
          onClick={() => setTab("budget")}
          className={`shrink-0 rounded-lg px-4 py-1.5 transition ${
            tab === "budget" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🎯 預算
        </button>
        <button
          onClick={() => setTab("assets")}
          className={`shrink-0 rounded-lg px-4 py-1.5 transition ${
            tab === "assets" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🏦 資產
        </button>
        <button
          onClick={() => setTab("analysis")}
          className={`shrink-0 rounded-lg px-4 py-1.5 transition ${
            tab === "analysis" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📊 分析
        </button>
      </div>

      {tab === "split" ? (
        <SplitBills expenseCats={allCats.filter((c) => c.kind === "expense")} />
      ) : tab === "assets" ? (
        <Assets />
      ) : tab === "budget" ? (
        <Budget budgets={budgets} monthTxs={monthTxs} categories={allCats} monthLabel={monthLabel} onChanged={loadBudgets} />
      ) : tab === "analysis" ? (
        <Analysis monthTxs={monthTxs} txs={txs} categories={allCats} monthLabel={monthLabel} />
      ) : (
       <>
      {/* 月份切換 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
          >
            ‹
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-bold text-slate-700">
            {monthLabel}
          </span>
          <button
            onClick={() => setOffset((o) => o + 1)}
            disabled={offset >= 0}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-30"
          >
            ›
          </button>
        </div>
        {offset !== 0 && (
          <button
            onClick={() => setOffset(0)}
            className="rounded-lg px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            回本月
          </button>
        )}
      </div>

      {/* 收支總覽 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">支出</p>
          <p className="mt-1 truncate text-lg font-black text-red-500">{money(expense)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">收入</p>
          <p className="mt-1 truncate text-lg font-black text-emerald-500">{money(income)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">結餘</p>
          <p
            className={`mt-1 truncate text-lg font-black ${
              balance >= 0 ? "text-slate-800" : "text-red-500"
            }`}
          >
            {money(balance)}
          </p>
        </div>
      </div>

      {/* 本月預算條 */}
      {(() => {
        const ob = budgets.find((b) => b.category === "");
        if (!ob || ob.amount <= 0) return null;
        const pct = Math.min((expense / ob.amount) * 100, 100);
        const over = expense > ob.amount;
        const near = !over && expense >= ob.amount * 0.8;
        return (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500">本月預算</span>
              <span className="text-slate-400">{money(expense)} / {money(ob.amount)}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${over ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs">
              {over ? (
                <span className="font-bold text-red-500">超出 {money(expense - ob.amount)}</span>
              ) : (
                <span className="text-slate-500">還可花 {money(ob.amount - expense)}</span>
              )}
            </p>
          </div>
        );
      })()}

      {/* 新增記錄按鈕 */}
      <button
        onClick={() => { setEditingTx(null); setTxModalOpen(true); }}
        className="w-full rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95"
      >
        ＋ 新增記錄
      </button>

      {/* 支出分類統計 */}
      {byCat.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-black text-slate-700">本月支出分佈</p>
          <div className="space-y-2.5">
            {byCat.map(([name, amt]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">
                    {emojiFrom(allCats, "expense", name)} {name}
                  </span>
                  <span className="text-slate-500">
                    {money(amt)}
                    <span className="ml-1 text-slate-400">
                      {Math.round((amt / expense) * 100)}%
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    style={{ width: `${(amt / expense) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 明細 */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">載入中…</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 py-12 text-center text-sm text-slate-400">
          這個月還沒有記錄，從上面記一筆開始吧。
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, rows]) => {
            const daySum = rows.reduce(
              (s, t) => s + (t.kind === "expense" ? -t.amount : t.kind === "income" ? t.amount : 0),
              0
            );
            return (
              <div key={date}>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-400">
                    {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}
                  </span>
                  <span className="text-xs text-slate-400">
                    {daySum >= 0 ? "+" : ""}
                    {money(daySum)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {rows.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-lg ring-1 ring-slate-100">
                        {t.kind === "transfer" ? "🔁" : emojiFrom(allCats, t.kind, t.category)}
                      </span>
                      <button
                        onClick={() => startEdit(t)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {t.kind === "transfer" ? "轉帳" : t.category}
                            {t.subcategory && (
                              <span className="font-normal text-slate-400"> · {t.subcategory}</span>
                            )}
                            {t.split_bill_id && <span className="ml-1" title="有分帳">🧾</span>}
                            {t.event_id && <span className="ml-0.5" title="連結行程">✈️</span>}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {t.account && <span>{t.account}</span>}
                            {t.account && t.note && "　·　"}
                            {t.note}
                          </p>
                        </div>
                      </button>
                      <span
                        className={`shrink-0 text-sm font-bold ${
                          t.kind === "expense"
                            ? "text-slate-800"
                            : t.kind === "income"
                              ? "text-emerald-500"
                              : "text-sky-500"
                        }`}
                      >
                        {t.kind === "expense" ? "-" : t.kind === "income" ? "+" : ""}
                        {money(t.amount)}
                      </span>
                      <button
                        onClick={() => handleDelete(t)}
                        className="shrink-0 rounded-md px-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                        title="刪除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
       </>
      )}

      <LedgerCategoryManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={loadCats}
      />

      <TransactionModal
        open={txModalOpen}
        initial={editingTx}
        categories={allCats}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        onSaved={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          load();
        }}
      />
    </div>
  );
}
