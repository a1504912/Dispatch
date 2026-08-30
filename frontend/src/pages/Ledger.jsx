import { useEffect, useMemo, useState } from "react";
import { listTransactions, deleteTransaction } from "../api/ledger";
import { listLedgerCategories } from "../api/ledgerCategories";
import { listBudgets } from "../api/budgets";
import { listInvoices, invoiceLoginStart, invoiceLoginSubmit, invoiceToTransaction } from "../api/invoices";
import { NO_BACKEND } from "../localMode";
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
      : kind === "adjust"
        ? "bg-violet-50 text-violet-600"
        : "bg-rose-50 text-rose-600";

function StatChip({ label, value, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow active:scale-[0.98]"
    >
      <p className="text-xs font-medium text-slate-400">
        {label} <span className="text-slate-300">›</span>
      </p>
      <p className={`mt-0.5 text-lg font-black ${tone === "income" ? "text-emerald-500" : "text-slate-800"}`}>
        {money(value)}
      </p>
    </button>
  );
}

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
  const [statModal, setStatModal] = useState(null); // {title, items} 點統計看清單
  const [invoices, setInvoices] = useState([]); // 本月載具發票
  const [invModal, setInvModal] = useState(null); // {title, day} 發票清單彈窗
  const [invBusy, setInvBusy] = useState(false); // 抓取中
  const [invMsg, setInvMsg] = useState(""); // 抓取結果訊息
  const [captcha, setCaptcha] = useState(null); // { sid, image } 驗證碼輸入彈窗
  const [captchaVal, setCaptchaVal] = useState("");

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
  function loadInvoices(ym) {
    if (NO_BACKEND) return;
    listInvoices({ month: ym })
      .then(setInvoices)
      .catch(() => setInvoices([]));
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
  const dayIncome = selectedDay ? dayData[selectedDay]?.income || 0 : 0;

  // 點統計 → 跳出該類別的清單
  function openStat(title, kind, day) {
    const items = txs
      .filter((t) => t.kind === kind && (day ? t.date === day : (t.date || "").startsWith(curYM)))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
    setStatModal({ title, items });
  }

  // 換月時清掉選取的日、重抓當月發票
  useEffect(() => {
    setSelectedDay(null);
    loadInvoices(curYM);
  }, [curYM]);

  // 發票：本月 / 當日
  const dayInvoices = useMemo(
    () => (selectedDay ? invoices.filter((i) => i.date === selectedDay) : []),
    [invoices, selectedDay]
  );
  const invModalItems = useMemo(() => {
    const list = invModal?.day
      ? invoices.filter((i) => i.date === invModal.day)
      : invoices;
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  }, [invoices, invModal]);

  function openInvoices(day) {
    const title = day
      ? `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} 發票`
      : `${monthLabel} 發票`;
    setInvMsg("");
    setInvModal({ title, day: day || null });
  }

  // 開始抓發票：先叫後端開瀏覽器登入，拿到驗證碼圖 → 跳出讓使用者輸入
  async function handleSync() {
    setInvBusy(true);
    setInvMsg("正在開啟登入…（第一次較久）");
    setCaptchaVal("");
    try {
      const r = await invoiceLoginStart();
      setCaptcha({ sid: r.sid, image: r.captcha_image });
      setInvMsg("");
    } catch (e) {
      setInvMsg("⚠️ " + (e?.response?.data?.detail || "無法開始登入，請到設定→系統確認發票載具設定"));
    } finally {
      setInvBusy(false);
    }
  }

  // 送出驗證碼 → 後端登入並抓發票
  async function submitCaptcha() {
    if (!captcha) return;
    setInvBusy(true);
    setInvMsg("登入中並抓取發票…（約 10–30 秒）");
    try {
      const r = await invoiceLoginSubmit(captcha.sid, captchaVal.trim());
      setCaptcha(null);
      loadInvoices(curYM);
      let m;
      if (r.fetched === 0) {
        // 把診斷資訊直接印在畫面上，貼給我就能校準
        m =
          `登入成功但沒抓到發票。診斷：` +
          `到=${(r.current_url || "").replace(/^https?:\/\/[^/]+/, "")}｜` +
          `點到選單=${r.menu_clicked ? "是" : "否"}｜` +
          `查詢請求=${(r.api_hits || []).join(", ") || "無"}｜` +
          `畫面按鈕=[${(r.buttons || []).join(" / ")}]`;
      } else {
        m = r.added > 0 ? `已新增 ${r.added} 張發票` : "沒有新的發票（都抓過了）";
        if (r.total_pages && r.pages_captured && r.pages_captured < r.total_pages)
          m += `（只抓到 ${r.pages_captured}/${r.total_pages} 頁，可再抓一次）`;
      }
      setInvMsg(m);
    } catch (e) {
      setInvMsg("⚠️ " + (e?.response?.data?.detail || "登入或抓取失敗"));
    } finally {
      setInvBusy(false);
    }
  }

  async function handleInvToTx(inv) {
    try {
      await invoiceToTransaction(inv.id, { category: "購物" });
      loadInvoices(curYM);
      load();
      setInvMsg(`已把「${inv.seller_name || inv.inv_num}」記成支出`);
    } catch (e) {
      setInvMsg("⚠️ " + (e?.response?.data?.detail || "記帳失敗"));
    }
  }

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
    <div className="mx-auto max-w-5xl space-y-5">
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
        <div className="mx-auto max-w-2xl"><SplitBills expenseCats={allCats.filter((c) => c.kind === "expense")} /></div>
      ) : tab === "assets" ? (
        <div className="mx-auto max-w-2xl"><Assets /></div>
      ) : tab === "budget" ? (
        <div className="mx-auto max-w-2xl"><Budget budgets={budgets} monthTxs={monthTxs} categories={allCats} monthLabel={monthLabel} onChanged={loadBudgets} /></div>
      ) : tab === "analysis" ? (
        <div className="mx-auto max-w-2xl"><Analysis monthTxs={monthTxs} txs={txs} categories={allCats} monthLabel={monthLabel} /></div>
      ) : (
       <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* 左欄：月結 + 新增 + 月曆 */}
        <div className="space-y-5">
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

      {/* 可點統計：當日 / 本月，點了看清單 */}
      <div className="space-y-2">
        {selectedDay && (
          <div className="grid grid-cols-2 gap-2">
            <StatChip
              label={`${Number(selectedDay.slice(5, 7))}/${Number(selectedDay.slice(8, 10))} 支出`}
              value={dayTotal}
              tone="expense"
              onClick={() => openStat(`${Number(selectedDay.slice(5, 7))}/${Number(selectedDay.slice(8, 10))} 支出`, "expense", selectedDay)}
            />
            <StatChip
              label="當日收入"
              value={dayIncome}
              tone="income"
              onClick={() => openStat(`${Number(selectedDay.slice(5, 7))}/${Number(selectedDay.slice(8, 10))} 收入`, "income", selectedDay)}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="本月支出" value={expense} tone="expense" onClick={() => openStat("本月支出", "expense", null)} />
          <StatChip label="本月收入" value={income} tone="income" onClick={() => openStat("本月收入", "income", null)} />
        </div>

        {/* 載具發票 */}
        {!NO_BACKEND && (
          <div className="space-y-2">
            {selectedDay && (
              <button
                onClick={() => openInvoices(selectedDay)}
                className="flex w-full items-center gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow active:scale-[0.98]"
              >
                <span className="text-lg">🧾</span>
                <span className="flex-1 text-sm font-semibold text-slate-700">
                  當日發票 <span className="text-slate-400">·</span> {dayInvoices.length} 張
                </span>
                <span className="text-slate-300">›</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => openInvoices(null)}
                className="flex flex-1 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow active:scale-[0.98]"
              >
                <span className="text-lg">🧾</span>
                <span className="flex-1 text-sm font-semibold text-slate-700">
                  本月發票 <span className="text-slate-400">·</span> {invoices.length} 張
                </span>
                <span className="text-slate-300">›</span>
              </button>
              <button
                onClick={handleSync}
                disabled={invBusy}
                className="shrink-0 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:opacity-60"
                title="登入財政部載具抓發票"
              >
                {invBusy ? "處理中…" : "🔄 抓發票"}
              </button>
            </div>
            {invMsg && <p className="px-1 text-xs text-slate-500">{invMsg}</p>}
          </div>
        )}
      </div>

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
        </div>

        {/* 右欄：選取那天（或整月）的明細 */}
        <div className="space-y-4">
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
                    const positive =
                      t.kind === "income" || refund || (t.kind === "adjust" && t.amount >= 0);
                    const negative =
                      (t.kind === "expense" && t.amount >= 0) || (t.kind === "adjust" && t.amount < 0);
                    return (
                      <div key={t.id} className="group flex items-center gap-3 px-3.5 py-2.5">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${tintOf(t.kind)}`}>
                          {t.kind === "transfer" ? "🔁" : t.kind === "adjust" ? "🔧" : emojiFrom(allCats, t.kind, t.category)}
                        </span>
                        <button onClick={() => startEdit(t)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {t.kind === "transfer" ? "轉帳" : t.kind === "adjust" ? "餘額校正" : t.category}
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
                            positive
                              ? "text-emerald-500"
                              : t.kind === "expense"
                                ? "text-slate-800"
                                : t.kind === "adjust"
                                  ? "text-rose-500"
                                  : "text-sky-500"
                          }`}
                        >
                          {positive ? "+" : negative ? "−" : ""}
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
        </div>
       </div>
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

      {/* 點統計 → 該類項目清單 */}
      {statModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setStatModal(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">{statModal.title}</h2>
              <button onClick={() => setStatModal(null)} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {statModal.items.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">沒有項目。</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {statModal.items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setStatModal(null); startEdit(t); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${tintOf(t.kind)}`}>
                        {emojiFrom(allCats, t.kind, t.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {t.category}
                          {t.subcategory && <span className="font-normal text-slate-400"> · {t.subcategory}</span>}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {Number(t.date.slice(5, 7))}/{Number(t.date.slice(8, 10))}
                          {t.account && `　·　${t.account}`}
                          {t.note && `　·　${t.note}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-black tabular-nums ${t.kind === "income" ? "text-emerald-500" : "text-slate-800"}`}>
                        {money(Math.abs(t.amount))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
              <span className="text-slate-400">共 {statModal.items.length} 筆</span>
              <span className="font-black text-slate-800">合計 {money(statModal.items.reduce((s, t) => s + t.amount, 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* 驗證碼輸入（登入財政部平台） */}
      {captcha && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => !invBusy && setCaptcha(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900">輸入驗證碼</h2>
            <p className="mt-1 text-xs text-slate-400">財政部平台的圖形驗證碼，登入用（一次）。</p>
            {captcha.image ? (
              <img src={captcha.image} alt="驗證碼" className="mt-3 w-full rounded-lg border border-slate-200 bg-white" />
            ) : (
              <p className="mt-3 text-sm text-amber-600">（沒抓到驗證碼圖，請看主機除錯截圖）</p>
            )}
            <input
              autoFocus
              value={captchaVal}
              onChange={(e) => setCaptchaVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCaptcha()}
              placeholder="照著圖片打"
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-center text-lg font-bold tracking-widest outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            {invMsg && <p className="mt-2 text-xs text-slate-500">{invMsg}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setCaptcha(null)} disabled={invBusy} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50">取消</button>
              <button onClick={submitCaptcha} disabled={invBusy || !captchaVal.trim()} className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {invBusy ? "抓取中…" : "登入抓發票"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 發票清單（載具） */}
      {invModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setInvModal(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">{invModal.title}</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSync}
                  disabled={invBusy}
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {invBusy ? "處理中…" : "🔄 抓發票"}
                </button>
                <button onClick={() => setInvModal(null)} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
              </div>
            </div>
            {invMsg && <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{invMsg}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {invModalItems.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-slate-400">
                  沒有發票。按右上「同步」向財政部載具抓取，<br />或到設定→系統填入發票載具資料。
                </p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {invModalItems.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-lg text-amber-600">🧾</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {inv.seller_name || inv.inv_num}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {Number(inv.date.slice(5, 7))}/{Number(inv.date.slice(8, 10))}　·　{inv.inv_num}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums text-slate-800">{money(inv.amount)}</span>
                      {inv.transaction_id ? (
                        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-400">已記帳</span>
                      ) : (
                        <button
                          onClick={() => handleInvToTx(inv)}
                          className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-700 active:scale-95"
                        >
                          記成支出
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
              <span className="text-slate-400">共 {invModalItems.length} 張</span>
              <span className="font-black text-slate-800">合計 {money(invModalItems.reduce((s, i) => s + i.amount, 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* 浮動新增鈕（記錄頁；捲到哪都在，手機自動避開底部分頁列） */}
      {tab === "records" && (
        <button
          onClick={() => { setEditingTx(selectedDay ? { date: selectedDay } : null); setTxModalOpen(true); }}
          className="fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-600 active:scale-95 md:bottom-8 md:right-8"
          title="新增記錄"
          aria-label="新增記錄"
        >
          <span className="text-3xl font-light leading-none">＋</span>
        </button>
      )}
    </div>
  );
}
