import { useEffect, useMemo, useState } from "react";
import { listTransactions, deleteTransaction } from "../api/ledger";
import { listLedgerCategories } from "../api/ledgerCategories";
import { listBudgets } from "../api/budgets";
import Budget from "../components/Budget.jsx";
import Analysis from "../components/Analysis.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import LedgerCategoryManager from "../components/LedgerCategoryManager.jsx";
import SplitBills from "../components/SplitBills.jsx";
import Assets from "../components/Assets.jsx";
import TransactionModal from "../components/TransactionModal.jsx";

const emojiFrom = (cats, kind, name) =>
  cats.find((c) => c.kind === kind && c.name === name)?.emoji ||
  (kind === "income" ? "💵" : "📦");

const pad2 = (n) => String(n).padStart(2, "0");
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOf = (ds) => WD[new Date(`${ds}T00:00`).getDay()];
// 依收支別給圖示底色一點色調，畫面比較有層次（不是一片灰）
const tintOf = (kind) =>
  kind === "income"
    ? "bg-emerald-50 text-emerald-600"
    : kind === "transfer"
      ? "bg-sky-50 text-sky-600"
      : "bg-rose-50 text-rose-600";

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
  const [selectedDay, setSelectedDay] = useState(null); // "YYYY-MM-DD" 或 null（整月）

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

  // 支出分類統計已移到「分析」分頁

  // 月曆每日資料 + 今天
  const todayStr = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
  const dayData = useMemo(() => {
    const m = {};
    for (const t of monthTxs) {
      const d = (m[t.date] ??= { expense: 0, income: 0 });
      if (t.kind === "expense") d.expense += t.amount;
      else if (t.kind === "income") d.income += t.amount;
    }
    return m;
  }, [monthTxs]);
  const dayTotal = selectedDay ? dayData[selectedDay]?.expense || 0 : 0;

  // 換月時清掉選取的日
  useEffect(() => {
    setSelectedDay(null);
  }, [curYM]);

  // 依日期分組（選了某天就只顯示那天）
  const grouped = useMemo(() => {
    const src = selectedDay ? monthTxs.filter((t) => t.date === selectedDay) : monthTxs;
    const g = {};
    for (const t of src) (g[t.date] ??= []).push(t);
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthTxs, selectedDay]);

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
      <h1 className="text-2xl font-black tracking-tight text-slate-900">記帳</h1>

      {/* 分頁 */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 text-sm font-semibold">
        {[
          ["records", "記錄"],
          ["split", "分帳"],
          ["budget", "預算"],
          ["assets", "資產"],
          ["analysis", "分析"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full px-4 py-1.5 transition ${
              tab === key
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
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
      {/* 月曆 */}
      <MonthCalendar
        year={cur.getFullYear()}
        month={cur.getMonth() + 1}
        dayData={dayData}
        todayStr={todayStr}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onPrev={() => setOffset((o) => o - 1)}
        onNext={() => setOffset((o) => Math.min(0, o + 1))}
        onToday={() => setOffset(0)}
        monthLabel={monthLabel}
      />

      {/* 月結 hero */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-indigo-500/25 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-14 -left-8 h-40 w-40 rounded-full bg-emerald-500/15 blur-2xl" />
        <div className="relative">
          <p className="text-xs font-medium text-slate-400">{monthLabel}・支出</p>
          <p className="mt-1 text-4xl font-black tracking-tight">{money(expense)}</p>
          <div className="mt-3 flex gap-6 text-sm">
            <span>
              <span className="text-slate-400">收入 </span>
              <b className="text-emerald-400">{money(income)}</b>
            </span>
            <span>
              <span className="text-slate-400">結餘 </span>
              <b className={balance >= 0 ? "text-white" : "text-rose-400"}>{money(balance)}</b>
            </span>
          </div>
          {(() => {
            const ob = budgets.find((b) => b.category === "");
            if (!ob || ob.amount <= 0) return null;
            const pct = Math.min((expense / ob.amount) * 100, 100);
            const over = expense > ob.amount;
            const near = !over && expense >= ob.amount * 0.8;
            return (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>本月預算</span>
                  <span>{money(expense)} / {money(ob.amount)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : near ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[11px]">
                  {over ? (
                    <span className="font-bold text-rose-400">超出 {money(expense - ob.amount)}</span>
                  ) : (
                    <span className="text-slate-400">還可花 {money(ob.amount - expense)}</span>
                  )}
                </p>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 新增記錄 */}
      <button
        onClick={() => { setEditingTx(selectedDay ? { date: selectedDay } : null); setTxModalOpen(true); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 active:scale-[0.98]"
      >
        <span className="text-lg leading-none">＋</span> 新增記錄
      </button>

      {/* 選取某天時，顯示當天標題 */}
      {selectedDay && (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-slate-700">
            {Number(selectedDay.slice(5, 7))}/{Number(selectedDay.slice(8, 10))}（週{weekdayOf(selectedDay)}）
            {dayTotal > 0 && <span className="ml-2 font-normal text-rose-500">支出 {money(dayTotal)}</span>}
          </span>
          <button onClick={() => setSelectedDay(null)} className="text-xs font-semibold text-emerald-600 hover:underline">
            看整月
          </button>
        </div>
      )}

      {/* 明細 */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">載入中…</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl bg-white py-14 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-3xl">🧾</p>
          <p className="mt-2 text-sm text-slate-400">
            {selectedDay ? "這天沒有紀錄。" : "這個月還沒有記錄，按上面「新增記錄」開始。"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, rows]) => {
            const daySum = rows.reduce(
              (s, t) => s + (t.kind === "expense" ? -t.amount : t.kind === "income" ? t.amount : 0),
              0
            );
            return (
              <div key={date}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-sm font-bold text-slate-700">
                    {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}
                    <span className="ml-1.5 text-xs font-medium text-slate-400">週{weekdayOf(date)}</span>
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {daySum >= 0 ? "+" : ""}
                    {money(daySum)}
                  </span>
                </div>
                <div className="divide-y divide-slate-50 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                  {rows.map((t) => {
                    const refund = t.kind === "expense" && t.amount < 0;
                    const positive = t.kind === "income" || refund;
                    return (
                      <div key={t.id} className="group flex items-center gap-3 px-3.5 py-2.5">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${tintOf(t.kind)}`}>
                          {t.kind === "transfer" ? "🔁" : emojiFrom(allCats, t.kind, t.category)}
                        </span>
                        <button onClick={() => startEdit(t)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {t.kind === "transfer" ? "轉帳" : t.category}
                            {t.subcategory && (
                              <span className="font-normal text-slate-400"> · {t.subcategory}</span>
                            )}
                            {t.split_bill_id && <span className="ml-1" title="有分帳">🧾</span>}
                            {t.event_id && <span className="ml-0.5" title="連結行程">✈️</span>}
                          </p>
                          {(t.account || t.note) && (
                            <p className="truncate text-xs text-slate-400">
                              {t.account}
                              {t.account && t.note && "　·　"}
                              {t.note}
                            </p>
                          )}
                        </button>
                        <span
                          className={`shrink-0 text-[15px] font-black tabular-nums ${
                            positive ? "text-emerald-500" : t.kind === "expense" ? "text-slate-800" : "text-sky-500"
                          }`}
                        >
                          {positive ? "+" : t.kind === "expense" ? "−" : ""}
                          {money(Math.abs(t.amount))}
                        </span>
                        <button
                          onClick={() => handleDelete(t)}
                          className="shrink-0 rounded-md px-0.5 text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                          title="刪除"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
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
