import { useEffect, useMemo, useState } from "react";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "../api/accounts";
import { listTransactions } from "../api/ledger";

const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const ACC_EMOJIS = ["💵", "🏦", "💳", "📱", "💱", "🪙", "💰", "🏧", "🧧", "💸"];

function balanceOf(acc, txs) {
  let bal = Number(acc.initial) || 0;
  for (const t of txs) {
    const isThis = t.account_id === acc.id || (t.account_id == null && t.account === acc.name);
    if (t.kind === "transfer") {
      if (t.account_id === acc.id) bal -= t.amount;
      if (t.to_account_id === acc.id) bal += t.amount;
    } else if (t.kind === "income" && isThis) {
      bal += t.amount;
    } else if (t.kind === "expense" && isThis) {
      bal -= t.amount;
    }
  }
  return bal;
}

export default function Assets() {
  const [accounts, setAccounts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [subName, setSubName] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💰");

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
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-sm">
        <p className="text-xs font-medium text-slate-500">總資產</p>
        <p className={`mt-1 text-3xl font-black ${total >= 0 ? "text-slate-900" : "text-red-500"}`}>{money(total)}</p>
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
              <div key={top.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 p-3">
                  <button onClick={() => { setExpanded(isOpen ? null : top.id); setSubName(""); }} className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`}>▸</button>
                  <select value={top.emoji} onChange={(e) => saveField(top, { emoji: e.target.value })} className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-xl ring-1 ring-slate-200">
                    {ACC_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input defaultValue={top.name} onBlur={(e) => e.target.value.trim() && e.target.value !== top.name && saveField(top, { name: e.target.value.trim() })} className={`${field} min-w-0 flex-1 font-semibold`} />
                  <div className="shrink-0 text-right">
                    <p className={`text-lg font-black ${groupBal >= 0 ? "text-slate-800" : "text-red-500"}`}>{money(groupBal)}</p>
                    <button onClick={() => window.confirm(`刪除「${top.name}」？${isGroup ? "（底下子帳戶也會刪除）" : ""}`) && deleteAccount(top.id).then(reload)} className="text-xs text-slate-300 hover:text-red-500">刪除</button>
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
      </p>
    </div>
  );
}
