import { useEffect, useMemo, useState } from "react";
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "../api/ledger";

// 預設分類（依收支切換）
const CATS = {
  expense: [
    { name: "餐飲", emoji: "🍜" },
    { name: "交通", emoji: "🚗" },
    { name: "購物", emoji: "🛍️" },
    { name: "娛樂", emoji: "🎮" },
    { name: "居家", emoji: "🏠" },
    { name: "醫療", emoji: "💊" },
    { name: "學習", emoji: "📚" },
    { name: "人情", emoji: "🎁" },
    { name: "訂閱", emoji: "💳" },
    { name: "其他", emoji: "📦" },
  ],
  income: [
    { name: "薪水", emoji: "💰" },
    { name: "獎金", emoji: "🎉" },
    { name: "投資", emoji: "📈" },
    { name: "退款", emoji: "↩️" },
    { name: "其他", emoji: "💵" },
  ],
};

const emojiOf = (kind, name) =>
  CATS[kind]?.find((c) => c.name === name)?.emoji || (kind === "income" ? "💵" : "📦");

const pad2 = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

const emptyForm = () => ({ kind: "expense", amount: "", category: "餐飲", note: "", date: todayStr() });

export default function Ledger() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0); // 0 = 本月
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    listTransactions()
      .then(setTxs)
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
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

  async function handleSubmit(e) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0 || saving) return;
    setSaving(true);
    const payload = {
      kind: form.kind,
      amount,
      category: form.category || "其他",
      note: form.note.trim(),
      date: form.date || todayStr(),
    };
    try {
      if (editingId) await updateTransaction(editingId, payload);
      else await createTransaction(payload);
      setForm((f) => ({ ...emptyForm(), kind: f.kind, category: f.category, date: f.date }));
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      kind: t.kind,
      amount: String(t.amount),
      category: t.category,
      note: t.note || "",
      date: t.date,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(t) {
    if (!window.confirm("刪除這筆記錄？")) return;
    await deleteTransaction(t.id);
    if (editingId === t.id) {
      setEditingId(null);
      setForm(emptyForm());
    }
    load();
  }

  const cats = CATS[form.kind];
  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">記帳</h1>
        <p className="mt-1 text-sm text-slate-500">記錄每天的收支，看看錢都花到哪去了。</p>
      </div>

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

      {/* 新增 / 編輯 */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {["expense", "income"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, kind: k, category: CATS[k][0].name }))
                }
                className={`rounded-lg px-4 py-1.5 transition ${
                  form.kind === k
                    ? k === "expense"
                      ? "bg-white text-red-600 shadow-sm"
                      : "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {k === "expense" ? "支出" : "收入"}
              </button>
            ))}
          </div>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
              }}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              取消編輯
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              placeholder="金額"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={`${field} w-full pl-7 text-lg font-bold`}
              autoFocus
            />
          </div>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={`${field} w-36`}
          />
        </div>

        {/* 分類選擇 */}
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setForm({ ...form, category: c.name })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                form.category === c.name
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className={`${field} flex-1`}
            placeholder="備註（可留空）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <button
            type="submit"
            disabled={!Number(form.amount) || saving}
            className="shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            {editingId ? "儲存" : "＋ 記一筆"}
          </button>
        </div>
      </form>

      {/* 支出分類統計 */}
      {byCat.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-black text-slate-700">本月支出分佈</p>
          <div className="space-y-2.5">
            {byCat.map(([name, amt]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">
                    {emojiOf("expense", name)} {name}
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
              (s, t) => s + (t.kind === "expense" ? -t.amount : t.amount),
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
                        {emojiOf(t.kind, t.category)}
                      </span>
                      <button
                        onClick={() => startEdit(t)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {t.category}
                          </p>
                          {t.note && <p className="truncate text-xs text-slate-400">{t.note}</p>}
                        </div>
                      </button>
                      <span
                        className={`shrink-0 text-sm font-bold ${
                          t.kind === "expense" ? "text-slate-800" : "text-emerald-500"
                        }`}
                      >
                        {t.kind === "expense" ? "-" : "+"}
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
    </div>
  );
}
