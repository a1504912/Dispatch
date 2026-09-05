import { useEffect, useMemo, useState } from "react";
import { listMembers, createMember, updateMember, deleteMember } from "../api/members";
import { listSplitBills, createSplitBill, deleteSplitBill } from "../api/splitbills";
import { listSettlements, createSettlement, deleteSettlement } from "../api/settlements";
import { listAccounts } from "../api/accounts";
import { evalExpr, hasOperator } from "../calc";
import CalcButtons from "./CalcButtons.jsx";

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const r2 = (n) => Math.round(n * 100) / 100;
const todayStr = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const MEMBER_EMOJIS = ["🙂", "🧑", "👩", "👨", "🧒", "👵", "👴", "🐶", "🐱", "💼", "🎓", "🏠"];

// 依方法算出每個參與者分攤金額
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

/* ---------------- 成員管理 ---------------- */
function MembersModal({ open, members, onClose, onChanged }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙂");
  if (!open) return null;

  const field =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  async function add() {
    if (!name.trim()) return;
    await createMember({ name: name.trim(), emoji });
    setName("");
    setEmoji("🙂");
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">成員名單</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {members.length === 0 && <p className="py-6 text-center text-sm text-slate-400">還沒有成員，在下面新增。</p>}
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <select
                value={m.emoji}
                onChange={(e) => updateMember(m.id, { name: m.name, emoji: e.target.value }).then(onChanged)}
                className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-lg ring-1 ring-slate-200"
              >
                {MEMBER_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <input
                defaultValue={m.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && updateMember(m.id, { name: e.target.value.trim(), emoji: m.emoji }).then(onChanged)}
                className={`${field} flex-1`}
              />
              <button
                onClick={() => window.confirm(`刪除成員「${m.name}」？`) && deleteMember(m.id).then(onChanged)}
                className="rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-red-50 hover:text-red-500"
              >🗑</button>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <select value={emoji} onChange={(e) => setEmoji(e.target.value)} className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-lg ring-1 ring-slate-200">
              {MEMBER_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="新增成員名字" className={`${field} flex-1`} />
            <button onClick={add} disabled={!name.trim()} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">＋</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 新增分帳 ---------------- */
function SplitBillModal({ open, members, expenseCats, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState("");
  const [payer, setPayer] = useState("self");
  const [method, setMethod] = useState("equal");
  const [checked, setChecked] = useState({}); // who -> bool
  const [inputs, setInputs] = useState({}); // who -> string (exact 金額 / shares 份數)

  useEffect(() => {
    if (!open) return;
    // 預設全員參與、份數各 1
    const c = { self: true };
    const w = { self: "1" };
    members.forEach((m) => {
      c[String(m.id)] = true;
      w[String(m.id)] = "1";
    });
    setChecked(c);
    setInputs(w);
    setTitle("");
    setTotal("");
    setDate(todayStr());
    setCategory("");
    setPayer("self");
    setMethod("equal");
  }, [open, members]);

  if (!open) return null;

  const totalNum = evalExpr(total);
  const everyone = ["self", ...members.map((m) => String(m.id))];
  const parts = everyone.filter((w) => checked[w]);
  const shares = computeShares(method, parts, totalNum, inputs);
  const shareSum = parts.reduce((s, p) => s + (shares[p] || 0), 0);

  const nameOf = (who) => (who === "self" ? "你" : members.find((m) => String(m.id) === who)?.name || "?");
  const emojiOf = (who) => (who === "self" ? "🧑‍💻" : members.find((m) => String(m.id) === who)?.emoji || "🙂");

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  const exactMismatch = method === "exact" && Math.abs(shareSum - totalNum) > 0.5;
  const canSave = title.trim() && totalNum > 0 && parts.length > 0 && !exactMismatch;

  async function save() {
    if (!canSave) return;
    const arr = parts.map((p) => ({ who: p, value: shares[p] || 0 }));
    await createSplitBill({
      title: title.trim(),
      total: totalNum,
      date,
      category,
      payer,
      method,
      shares: JSON.stringify(arr),
      note: "",
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">新增分帳</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="項目，例：火鍋聚餐" className={`${field} w-full`} autoFocus />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input type="text" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="總金額（可算式）" className={`${field} w-full pl-6 text-lg font-bold`} />
              {hasOperator(total) && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">＝ {money(totalNum)}</span>
              )}
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-36`} />
          </div>
          <CalcButtons value={total} onChange={setTotal} />

          {expenseCats?.length > 0 && (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} w-full`}>
              <option value="">（不分類）</option>
              {expenseCats.map((c) => <option key={c.id ?? c.name} value={c.name}>{c.emoji} {c.name}</option>)}
            </select>
          )}

          {/* 誰付的 */}
          <div>
            <p className="mb-1 text-xs font-bold text-slate-500">誰付的</p>
            <div className="flex flex-wrap gap-1.5">
              {everyone.map((w) => (
                <button key={w} type="button" onClick={() => setPayer(w)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${payer === w ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"}`}>
                  {emojiOf(w)} {nameOf(w)}
                </button>
              ))}
            </div>
          </div>

          {/* 分法 */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {[["equal", "平均分"], ["exact", "各自指定"], ["shares", "份數"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMethod(k)}
                className={`flex-1 rounded-lg px-2 py-1.5 transition ${method === k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* 參與者 + 分攤 */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-500">參與的人（勾選）</p>
            {everyone.map((w) => (
              <div key={w} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <input type="checkbox" checked={!!checked[w]} onChange={(e) => setChecked({ ...checked, [w]: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                <span className="flex-1 text-sm text-slate-700">{emojiOf(w)} {nameOf(w)}</span>
                {checked[w] && method === "exact" && (
                  <input type="number" inputMode="decimal" min="0" value={inputs[w] ?? ""} onChange={(e) => setInputs({ ...inputs, [w]: e.target.value })} placeholder="金額" className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm" />
                )}
                {checked[w] && method === "shares" && (
                  <input type="number" inputMode="numeric" min="0" value={inputs[w] ?? ""} onChange={(e) => setInputs({ ...inputs, [w]: e.target.value })} placeholder="份" className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm" />
                )}
                {checked[w] && (
                  <span className="w-16 shrink-0 text-right text-sm font-bold text-slate-700">{money(shares[w] || 0)}</span>
                )}
              </div>
            ))}
          </div>

          <p className={`text-right text-xs ${exactMismatch ? "text-red-500" : "text-slate-400"}`}>
            分攤合計 {money(shareSum)} / 總額 {money(totalNum)}
            {exactMismatch && "（需相符才能儲存）"}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">取消</button>
          <button onClick={save} disabled={!canSave} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 結算/沖帳 ---------------- */
function SettleModal({ target, accounts, onClose, onSaved }) {
  const net = target.net;
  const dir = net > 0 ? "in" : "out"; // in：對方還你；out：你還對方
  const [amount, setAmount] = useState(String(Math.round(Math.abs(net))));
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState(dir === "in" ? "income" : "expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? null);
  const [saving, setSaving] = useState(false);

  const inMethods = [
    ["income", "記為收入", "還款當成一筆收入"],
    ["offset", "沖銷支出", "扣回原本的支出（負支出）"],
    ["none", "不記帳", "只把帳清掉，不進記帳"],
  ];
  const outMethods = [
    ["expense", "記為支出", "你付出的錢記一筆支出"],
    ["none", "不記帳", "只把帳清掉，不進記帳"],
  ];
  const methods = dir === "in" ? inMethods : outMethods;
  const needAccount = method !== "none";

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  async function save() {
    const amt = evalExpr(amount);
    if (!amt || amt <= 0 || saving) return;
    setSaving(true);
    try {
      await createSettlement({
        member_id: target.id,
        amount: amt,
        direction: dir,
        date,
        method,
        account_id: needAccount ? accountId : null,
        note: "",
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">{dir === "in" ? "收款結清" : "還款結清"}</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-600">
            {target.emoji} <b>{target.name}</b>
            {dir === "in" ? ` 欠你 ${money(Math.abs(net))}` : `：你欠 ${money(Math.abs(net))}`}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-full pl-7 text-lg font-bold`} />
              {hasOperator(amount) && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">＝ {money(evalExpr(amount))}</span>
              )}
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-36`} />
          </div>
          <CalcButtons value={amount} onChange={setAmount} />

          <div>
            <p className="mb-1 text-xs font-bold text-slate-500">記帳方式</p>
            <div className="space-y-1.5">
              {methods.map(([k, label, desc]) => (
                <button key={k} type="button" onClick={() => setMethod(k)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${method === k ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${method === k ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`} />
                  <span className="min-w-0">
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                    <span className="block text-[11px] text-slate-400">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {needAccount && accounts.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-slate-500">{dir === "in" ? "款項進哪個帳戶" : "從哪個帳戶付"}</p>
              <select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))} className={`${field} w-full`}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">取消</button>
          <button onClick={save} disabled={!evalExpr(amount) || saving} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40">
            {saving ? "處理中…" : "確認結清"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 主畫面 ---------------- */
export default function SplitBills({ expenseCats = [] }) {
  const [members, setMembers] = useState([]);
  const [bills, setBills] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settleFor, setSettleFor] = useState(null); // {id,name,emoji,net}

  function reload() {
    setLoading(true);
    Promise.all([listMembers(), listSplitBills(), listSettlements(), listAccounts()])
      .then(([m, b, s, a]) => {
        setMembers(m);
        setBills(b);
        setSettlements(s);
        setAccounts(a);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    reload();
  }, []);

  const nameOf = (who) => (who === "self" ? "你" : members.find((m) => String(m.id) === String(who))?.name || "（已刪成員）");
  const emojiOf = (who) => (who === "self" ? "🧑‍💻" : members.find((m) => String(m.id) === String(who))?.emoji || "🙂");

  // 誰欠誰：正數＝對方欠你
  const balances = useMemo(() => {
    const net = {};
    for (const bill of bills) {
      let shares = [];
      try {
        shares = JSON.parse(bill.shares || "[]");
      } catch {
        shares = [];
      }
      const smap = {};
      shares.forEach((s) => (smap[String(s.who)] = Number(s.value) || 0));
      if (bill.payer === "self") {
        Object.entries(smap).forEach(([who, val]) => {
          if (who !== "self") net[who] = r2((net[who] || 0) + val);
        });
      } else {
        const selfShare = smap.self || 0;
        if (selfShare) net[bill.payer] = r2((net[bill.payer] || 0) - selfShare);
      }
    }
    // 扣掉已結算：in（對方還你）減少對方欠你；out（你還對方）增加
    for (const s of settlements) {
      const key = String(s.member_id);
      const delta = s.direction === "in" ? -s.amount : s.amount;
      net[key] = r2((net[key] || 0) + delta);
    }
    return net;
  }, [bills, settlements]);

  const owedToYou = Object.values(balances).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const youOwe = Object.values(balances).filter((v) => v < 0).reduce((a, b) => a - b, 0);

  async function handleDeleteBill(bill) {
    if (!window.confirm(`刪除分帳「${bill.title}」？`)) return;
    await deleteSplitBill(bill.id);
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-4 text-sm">
          <span>
            別人共欠你 <b className="text-emerald-600">{money(owedToYou)}</b>
          </span>
          <span>
            你共欠 <b className="text-red-500">{money(youOwe)}</b>
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMembersOpen(true)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
            👥 成員
          </button>
          <button onClick={() => setAddOpen(true)} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95">
            ＋ 新增分帳
          </button>
        </div>
      </div>

      {/* 誰欠誰 */}
      {Object.keys(balances).length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
          <p className="mb-3 text-sm font-black text-slate-700">結算</p>
          <div className="space-y-2">
            {Object.entries(balances)
              .filter(([, v]) => Math.abs(v) >= 0.5)
              .sort((a, b) => b[1] - a[1])
              .map(([who, v]) => (
                <div key={who} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-700">{emojiOf(who)} {nameOf(who)}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${v > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {v > 0 ? `欠你 ${money(v)}` : `你欠 ${money(-v)}`}
                    </span>
                    {who !== "self" && members.some((m) => String(m.id) === who) && (
                      <button
                        onClick={() => setSettleFor({ id: Number(who), name: nameOf(who), emoji: emojiOf(who), net: v })}
                        className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-white transition hover:bg-slate-700 active:scale-95"
                      >
                        {v > 0 ? "收款" : "還款"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            {Object.values(balances).every((v) => Math.abs(v) < 0.5) && (
              <p className="text-center text-sm text-slate-400">目前都結清了 🎉</p>
            )}
          </div>
        </div>
      )}

      {/* 還款紀錄 */}
      {settlements.length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
          <p className="mb-2 text-sm font-black text-slate-700">還款紀錄</p>
          <div className="space-y-1.5">
            {settlements.map((s) => {
              const m = members.find((x) => x.id === s.member_id);
              const methodLabel = { income: "記收入", offset: "沖銷支出", expense: "記支出", none: "未記帳" }[s.method] || "";
              return (
                <div key={s.id} className="group flex items-center gap-2 text-sm">
                  <span className="text-slate-500">{String(s.date).slice(5).replace("-", "/")}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {s.direction === "in" ? "收" : "付"} {m ? `${m.emoji} ${m.name}` : "成員"} {money(s.amount)}
                    <span className="ml-1 text-xs text-slate-400">· {methodLabel}</span>
                  </span>
                  <button
                    onClick={async () => {
                      if (!window.confirm("撤銷這筆還款？（連同它建立的記帳也會刪除）")) return;
                      await deleteSettlement(s.id);
                      reload();
                    }}
                    className="shrink-0 rounded-md px-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 分帳紀錄 */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">載入中…</p>
      ) : bills.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 py-12 text-center text-sm text-slate-400">
          還沒有分帳紀錄。先到「👥 成員」加人，再按「＋ 新增分帳」。
        </p>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => {
            let shares = [];
            try {
              shares = JSON.parse(bill.shares || "[]");
            } catch {
              shares = [];
            }
            return (
              <div key={bill.id} className="group rounded-2xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-800">{bill.title}</p>
                    <p className="text-xs text-slate-400">
                      {String(bill.date).slice(5).replace("-", "/")}　·　{emojiOf(bill.payer)} {nameOf(bill.payer)} 先付　·　共 {shares.length} 人
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-black text-slate-800">{money(bill.total)}</span>
                  <button onClick={() => handleDeleteBill(bill)} className="shrink-0 rounded-md px-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100">✕</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {shares.map((s) => (
                    <span key={s.who} className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500 ring-1 ring-slate-100">
                      {emojiOf(String(s.who))} {nameOf(String(s.who))} {money(s.value)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {settleFor && (
        <SettleModal
          target={settleFor}
          accounts={accounts}
          onClose={() => setSettleFor(null)}
          onSaved={() => {
            setSettleFor(null);
            reload();
          }}
        />
      )}

      <MembersModal open={membersOpen} members={members} onClose={() => setMembersOpen(false)} onChanged={reload} />
      <SplitBillModal
        open={addOpen}
        members={members}
        expenseCats={expenseCats}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          reload();
        }}
      />
    </div>
  );
}
