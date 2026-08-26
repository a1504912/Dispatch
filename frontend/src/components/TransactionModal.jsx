import { useEffect, useState } from "react";
import { createTransaction, updateTransaction } from "../api/ledger";
import { listMembers } from "../api/members";
import { createSplitBill } from "../api/splitbills";
import { listEvents } from "../api/events";

// 帳戶（先用預設清單；之後「資產」頁會做成可自訂＋有餘額）
export const ACCOUNTS = [
  { name: "現金", emoji: "💵" },
  { name: "銀行帳戶", emoji: "🏦" },
  { name: "信用卡", emoji: "💳" },
  { name: "電子支付", emoji: "📱" },
  { name: "外幣", emoji: "💱" },
];

const r2 = (n) => Math.round(n * 100) / 100;
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const todayStr = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function computeShares(method, parts, total, inputs) {
  const out = {};
  if (parts.length === 0) return out;
  if (method === "equal") {
    const base = r2(total / parts.length);
    parts.forEach((p) => (out[p] = base));
    out[parts[0]] = r2(base + (total - base * parts.length));
  } else if (method === "exact") {
    parts.forEach((p) => (out[p] = Number(inputs[p]) || 0));
  } else {
    const weights = parts.map((p) => Number(inputs[p]) || 0);
    const sumW = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    parts.forEach((p, i) => {
      out[p] = r2((total * weights[i]) / sumW);
      acc += out[p];
    });
    out[parts[0]] = r2(out[parts[0]] + (total - acc));
  }
  return out;
}

export default function TransactionModal({ open, initial, categories = [], onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  // 分帳
  const [splitOn, setSplitOn] = useState(false);
  const [method, setMethod] = useState("equal");
  const [checked, setChecked] = useState({});
  const [inputs, setInputs] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm({
      kind: initial?.kind ?? "expense",
      amount: initial?.amount != null ? String(initial.amount) : "",
      category: initial?.category ?? "",
      subcategory: initial?.subcategory ?? "",
      note: initial?.note ?? "",
      date: initial?.date ?? todayStr(),
      account: initial?.account ?? "現金",
      event_id: initial?.event_id ?? null,
    });
    setSplitOn(false);
    setMethod("equal");
    setSaving(false);
    listMembers().then(setMembers).catch(() => setMembers([]));
    listEvents()
      .then((evs) => setEvents(evs.filter((e) => !e.is_task).sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)))))
      .catch(() => setEvents([]));
  }, [open, initial]);

  useEffect(() => {
    // 開啟分帳時，預設全員參與、份數 1
    const c = { self: true };
    const w = { self: "1" };
    members.forEach((m) => {
      c[String(m.id)] = true;
      w[String(m.id)] = "1";
    });
    setChecked(c);
    setInputs(w);
  }, [members, splitOn]);

  if (!open || !form) return null;

  const cats = categories.filter((c) => c.kind === form.kind && !c.parent_id);
  const selectedCat = cats.find((c) => c.name === form.category);
  const subCats = selectedCat ? categories.filter((c) => c.parent_id === selectedCat.id) : [];

  const amountNum = Number(form.amount) || 0;
  const everyone = ["self", ...members.map((m) => String(m.id))];
  const parts = everyone.filter((w) => checked[w]);
  const shares = computeShares(method, parts, amountNum, inputs);
  const shareSum = parts.reduce((s, p) => s + (shares[p] || 0), 0);
  const nameOf = (w) => (w === "self" ? "你" : members.find((m) => String(m.id) === w)?.name || "?");
  const emojiOf = (w) => (w === "self" ? "🧑‍💻" : members.find((m) => String(m.id) === w)?.emoji || "🙂");
  const exactBad = splitOn && method === "exact" && Math.abs(shareSum - amountNum) > 0.5;

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  const canSave = amountNum > 0 && !exactBad && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      let splitBillId = initial?.split_bill_id ?? null;
      // 記帳時分帳：建立一筆分帳（你先付），別人欠你他們那份
      if (splitOn && !isEdit && form.kind === "expense" && parts.length > 1) {
        const arr = parts.map((p) => ({ who: p, value: shares[p] || 0 }));
        const bill = await createSplitBill({
          title: form.note.trim() || form.category || "分帳",
          total: amountNum,
          date: form.date,
          category: form.category,
          payer: "self",
          method,
          shares: JSON.stringify(arr),
          note: "",
        });
        splitBillId = bill?.id ?? null;
      }
      const payload = {
        kind: form.kind,
        amount: amountNum,
        category: form.kind === "income" || form.kind === "expense" ? form.category || "其他" : "",
        subcategory: form.subcategory || "",
        note: form.note.trim(),
        date: form.date || todayStr(),
        account: form.account || "",
        event_id: form.event_id ?? null,
        split_bill_id: splitBillId,
      };
      if (isEdit) await updateTransaction(initial.id, payload);
      else await createTransaction(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">{isEdit ? "編輯記錄" : "新增記錄"}</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* 支出 / 收入 */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {[["expense", "支出", "text-red-600"], ["income", "收入", "text-emerald-600"]].map(([k, label, col]) => (
              <button key={k} type="button"
                onClick={() => setForm((f) => ({ ...f, kind: k, category: "", subcategory: "" }))}
                className={`flex-1 rounded-lg px-4 py-1.5 transition ${form.kind === k ? `bg-white ${col} shadow-sm` : "text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* 分類（可橫向滑） */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {cats.map((c) => (
              <button key={c.id ?? c.name} type="button"
                onClick={() => setForm({ ...form, category: c.name, subcategory: "" })}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${form.category === c.name ? "bg-indigo-600 text-white shadow" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"}`}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          {subCats.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-l-2 border-slate-100 pl-3">
              <button type="button" onClick={() => setForm({ ...form, subcategory: "" })}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${!form.subcategory ? "bg-slate-700 text-white" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`}>不分</button>
              {subCats.map((s) => (
                <button key={s.id} type="button" onClick={() => setForm({ ...form, subcategory: s.name })}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${form.subcategory === s.name ? "bg-indigo-500 text-white" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"}`}>{s.name}</button>
              ))}
            </div>
          )}

          {/* 金額 + 日期 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input type="number" inputMode="decimal" min="0" placeholder="金額" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${field} w-full pl-7 text-lg font-bold`} autoFocus />
            </div>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${field} w-36`} />
          </div>

          <input className={`${field} w-full`} placeholder="備註（可留空）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

          {/* 帳戶 */}
          <div>
            <p className="mb-1 text-xs font-bold text-slate-500">帳戶</p>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNTS.map((a) => (
                <button key={a.name} type="button" onClick={() => setForm({ ...form, account: a.name })}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${form.account === a.name ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"}`}>
                  {a.emoji} {a.name}
                </button>
              ))}
            </div>
          </div>

          {/* 記帳時分帳（只在支出、新增時） */}
          {form.kind === "expense" && !isEdit && (
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-amber-600">
                <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                ⊕ 其中有代墊給別人？快速分攤
              </label>
              {splitOn && (
                <div className="mt-3 space-y-2">
                  {members.length === 0 ? (
                    <p className="text-xs text-slate-400">還沒有成員。請先到「分帳」分頁 → 👥 成員 新增。</p>
                  ) : (
                    <>
                      <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                        {[["equal", "平均"], ["exact", "各自"], ["shares", "份數"]].map(([k, l]) => (
                          <button key={k} type="button" onClick={() => setMethod(k)}
                            className={`flex-1 rounded-md px-2 py-1 ${method === k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{l}</button>
                        ))}
                      </div>
                      {everyone.map((w) => (
                        <div key={w} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!checked[w]} onChange={(e) => setChecked({ ...checked, [w]: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                          <span className="flex-1 text-slate-700">{emojiOf(w)} {nameOf(w)}{w === "self" && "（你）"}</span>
                          {checked[w] && method !== "equal" && (
                            <input type="number" min="0" value={inputs[w] ?? ""} onChange={(e) => setInputs({ ...inputs, [w]: e.target.value })}
                              placeholder={method === "exact" ? "金額" : "份"} className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm" />
                          )}
                          {checked[w] && <span className="w-16 text-right text-sm font-bold text-slate-700">{money(shares[w] || 0)}</span>}
                        </div>
                      ))}
                      <p className={`text-right text-xs ${exactBad ? "text-red-500" : "text-slate-400"}`}>
                        分攤合計 {money(shareSum)} / {money(amountNum)}{exactBad && "（需相符）"}
                      </p>
                      <p className="text-[11px] text-slate-400">記一筆支出＝你付的全額；別人那份會進「分帳」等他還你。</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 連結行程 */}
          <div>
            <p className="mb-1 text-xs font-bold text-slate-500">所屬行程（選填）</p>
            <select value={form.event_id ?? ""} onChange={(e) => setForm({ ...form, event_id: e.target.value ? Number(e.target.value) : null })} className={`${field} w-full`}>
              <option value="">✈️ 不連結</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{String(ev.start_time).slice(5, 10)} {ev.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">取消</button>
          <button onClick={handleSave} disabled={!canSave}
            className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
            {saving ? "儲存中…" : isEdit ? "儲存" : "新增一筆"}
          </button>
        </div>
      </div>
    </div>
  );
}
