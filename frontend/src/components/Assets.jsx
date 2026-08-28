import { useEffect, useMemo, useState } from "react";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "../api/accounts";
import { listTransactions, createTransaction } from "../api/ledger";

const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const ACC_EMOJIS = ["💵", "🏦", "💳", "📱", "💱", "🪙", "💰", "🏧", "🧧", "💸"];
const todayStr = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function balanceOf(acc, txs) {
  let bal = Number(acc.initial) || 0;
  for (const t of txs) {
    const isThis = t.account_id === acc.id || (t.account_id == null && t.account === acc.name);
    if (t.kind === "transfer") {
      if (t.account_id === acc.id) bal -= t.amount;
      if (t.to_account_id === acc.id) bal += t.amount;
    } else if (t.kind === "adjust") {
      if (t.account_id === acc.id) bal += t.amount; // 對帳校正（差額，可正可負）
    } else if (t.kind === "income" && isThis) {
      bal += t.amount;
    } else if (t.kind === "expense" && isThis) {
      bal -= t.amount;
    }
  }
  return bal;
}

/* 校正餘額：填實際餘額 → 自動補一筆差額對齊 */
function AdjustModal({ account, current, onClose, onSaved }) {
  const [actual, setActual] = useState(String(Math.round(current)));
  const [saving, setSaving] = useState(false);
  const diff = Math.round((Number(actual) - current) * 100) / 100;
  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  async function save() {
    if (saving || actual === "" || diff === 0) return;
    setSaving(true);
    try {
      await createTransaction({
        kind: "adjust",
        amount: diff,
        category: "餘額校正",
        note: "對帳校正",
        date: todayStr(),
        account: account.name,
        account_id: account.id,
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
          <h2 className="text-lg font-black text-slate-900">校正餘額</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-600">
            {account.emoji} <b>{account.name}</b> 目前系統餘額 <b>{money(current)}</b>
          </p>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">實際餘額（看網銀填入）</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input type="number" value={actual} onChange={(e) => setActual(e.target.value)} className={`${field} w-full pl-7 text-lg font-bold`} autoFocus />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            差額 <b className={diff >= 0 ? "text-emerald-600" : "text-rose-500"}>{diff >= 0 ? "+" : ""}{money(diff)}</b>
            {diff === 0 ? "（相同，不需校正）" : "，會自動補一筆「餘額校正」對齊，不算進收支。"}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">取消</button>
          <button onClick={save} disabled={saving || diff === 0} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-95 disabled:opacity-40">
            {saving ? "處理中…" : "校正"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Assets() {
  const [accounts, setAccounts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [subName, setSubName] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💰");
  const [adjustFor, setAdjustFor] = useState(null); // { account, current }

  function reload() {
    setLoading(true);
    Promise.all([listAccounts(), listTransactions()])
      .then(([a, t]) => {
        setAccounts(a);
        setTxs(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    reload();
  }, []);

  const tops = accounts.filter((a) => !a.parent_id);
  const childrenOf = (id) => accounts.filter((a) => a.parent_id === id);
  const bal = (a) => balanceOf(a, txs);

  // 可用帳戶 = 沒有子帳戶的主帳戶 + 所有子帳戶
  const total = useMemo(() => {
    let s = 0;
    for (const a of accounts) {
      const isGroup = !a.parent_id && accounts.some((x) => x.parent_id === a.id);
      if (!isGroup) s += bal(a);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, txs]);

  async function addTop() {
    if (!newName.trim()) return;
    await createAccount({ name: newName.trim(), emoji: newEmoji, initial: 0, sort: accounts.length });
    setNewName("");
    setNewEmoji("💰");
    reload();
  }
  async function addSub(top) {
    if (!subName.trim()) return;
    await createAccount({ name: subName.trim(), emoji: top.emoji, initial: 0, parent_id: top.id, sort: accounts.length });
    setSubName("");
    reload();
  }
  const saveField = (a, patch) =>
    updateAccount(a.id, { name: a.name, emoji: a.emoji, initial: a.initial, parent_id: a.parent_id ?? null, ...patch }).then(reload);

  const field =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-emerald-500/20 blur-2xl" />
        <p className="text-xs font-medium text-slate-400">總資產</p>
        <p className={`mt-1 text-4xl font-black tracking-tight ${total >= 0 ? "text-white" : "text-rose-400"}`}>{money(total)}</p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">載入中…</p>
      ) : (
        <div className="space-y-2">
          {tops.map((top) => {
            const kids = childrenOf(top.id);
            const isGroup = kids.length > 0;
            const groupBal = isGroup ? kids.reduce((s, k) => s + bal(k), 0) : bal(top);
            const isOpen = expanded === top.id;
            return (
              <div key={top.id} className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm">
                <div className="flex items-center gap-2 p-3">
                  <button onClick={() => { setExpanded(isOpen ? null : top.id); setSubName(""); }} className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`}>▸</button>
                  <select value={top.emoji} onChange={(e) => saveField(top, { emoji: e.target.value })} className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-xl ring-1 ring-slate-200">
                    {ACC_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input defaultValue={top.name} onBlur={(e) => e.target.value.trim() && e.target.value !== top.name && saveField(top, { name: e.target.value.trim() })} className={`${field} min-w-0 flex-1 font-semibold`} />
                  <div className="shrink-0 text-right">
                    <p className={`text-lg font-black ${groupBal >= 0 ? "text-slate-800" : "text-red-500"}`}>{money(groupBal)}</p>
                    <div className="flex justify-end gap-2">
                      {!isGroup && (
                        <button onClick={() => setAdjustFor({ account: top, current: bal(top) })} className="text-xs text-slate-400 hover:text-indigo-600">校正</button>
                      )}
                      <button onClick={() => window.confirm(`刪除「${top.name}」？${isGroup ? "（底下子帳戶也會刪除）" : ""}`) && deleteAccount(top.id).then(reload)} className="text-xs text-slate-300 hover:text-red-500">刪除</button>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-2 border-t border-slate-100 px-3 py-2 pl-9">
                    {/* 沒有子帳戶時，主帳戶自己就是可用帳戶，可設初始 */}
                    {!isGroup && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        本身初始餘額
                        <input type="number" defaultValue={top.initial} onBlur={(e) => Number(e.target.value) !== top.initial && saveField(top, { initial: Number(e.target.value) || 0 })} className="w-24 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs" />
                      </div>
                    )}
                    {kids.map((k) => (
                      <div key={k.id} className="flex items-center gap-2">
                        <span className="text-slate-300">•</span>
                        <input defaultValue={k.name} onBlur={(e) => e.target.value.trim() && e.target.value !== k.name && saveField(k, { name: e.target.value.trim() })} className={`${field} min-w-0 flex-1`} />
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          初始<input type="number" defaultValue={k.initial} onBlur={(e) => Number(e.target.value) !== k.initial && saveField(k, { initial: Number(e.target.value) || 0 })} className="w-20 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs" />
                        </span>
                        <span className={`w-16 shrink-0 text-right text-sm font-bold ${bal(k) >= 0 ? "text-slate-700" : "text-red-500"}`}>{money(bal(k))}</span>
                        <button onClick={() => setAdjustFor({ account: k, current: bal(k) })} className="shrink-0 text-xs text-slate-400 hover:text-indigo-600">校正</button>
                        <button onClick={() => window.confirm(`刪除子帳戶「${k.name}」？`) && deleteAccount(k.id).then(reload)} className="shrink-0 text-slate-300 hover:text-red-500">🗑</button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300">•</span>
                      <input value={subName} onChange={(e) => setSubName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub(top)} placeholder="新增子帳戶，例：台新銀行" className={`${field} flex-1`} />
                      <button onClick={() => addSub(top)} disabled={!subName.trim()} className="shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-sm font-bold text-white hover:bg-slate-600 disabled:opacity-40">＋</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 新增帳戶類型 */}
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-3">
            <select value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} className="rounded-lg bg-white px-1.5 py-1.5 text-xl ring-1 ring-slate-200">
              {ACC_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTop()} placeholder="新增帳戶（類型）" className={`${field} flex-1`} />
            <button onClick={addTop} disabled={!newName.trim()} className="shrink-0 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">＋</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        點「▸」展開可加子帳戶(例:銀行帳戶 → 台新／國泰)。有子帳戶的類型，記帳時要選到子帳戶。
        「校正」= 看網銀後把餘額對齊實際數字。
      </p>

      {adjustFor && (
        <AdjustModal
          account={adjustFor.account}
          current={adjustFor.current}
          onClose={() => setAdjustFor(null)}
          onSaved={() => {
            setAdjustFor(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
