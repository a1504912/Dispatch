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
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💰");
  const [newInitial, setNewInitial] = useState("");

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

  const balances = useMemo(() => accounts.map((a) => ({ ...a, balance: balanceOf(a, txs) })), [accounts, txs]);
  const total = balances.reduce((s, a) => s + a.balance, 0);

  async function addAccount() {
    if (!newName.trim()) return;
    await createAccount({ name: newName.trim(), emoji: newEmoji, initial: Number(newInitial) || 0, sort: accounts.length });
    setNewName("");
    setNewEmoji("💰");
    setNewInitial("");
    reload();
  }

  const field =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-5">
      {/* 總資產 */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-sm">
        <p className="text-xs font-medium text-slate-500">總資產</p>
        <p className={`mt-1 text-3xl font-black ${total >= 0 ? "text-slate-900" : "text-red-500"}`}>{money(total)}</p>
      </div>

      {/* 帳戶清單 */}
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">載入中…</p>
      ) : (
        <div className="space-y-2">
          {balances.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <select
                value={a.emoji}
                onChange={(e) => updateAccount(a.id, { name: a.name, emoji: e.target.value, initial: a.initial, sort: a.sort }).then(reload)}
                className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-xl ring-1 ring-slate-200"
              >
                {ACC_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <div className="min-w-0 flex-1">
                <input
                  defaultValue={a.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && updateAccount(a.id, { name: e.target.value.trim(), emoji: a.emoji, initial: a.initial, sort: a.sort }).then(reload)}
                  className={`${field} w-full font-semibold`}
                />
                <div className="mt-1 flex items-center gap-1 pl-1 text-xs text-slate-400">
                  初始
                  <input
                    type="number"
                    defaultValue={a.initial}
                    onBlur={(e) => Number(e.target.value) !== a.initial && updateAccount(a.id, { name: a.name, emoji: a.emoji, initial: Number(e.target.value) || 0, sort: a.sort }).then(reload)}
                    className="w-24 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-lg font-black ${a.balance >= 0 ? "text-slate-800" : "text-red-500"}`}>{money(a.balance)}</p>
                <button
                  onClick={() => window.confirm(`刪除帳戶「${a.name}」？（已記錄的帳目不受影響）`) && deleteAccount(a.id).then(reload)}
                  className="text-xs text-slate-300 hover:text-red-500"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}

          {/* 新增帳戶 */}
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-3">
            <select value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} className="rounded-lg bg-white px-1.5 py-1.5 text-xl ring-1 ring-slate-200">
              {ACC_EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新增帳戶名稱" className={`${field} flex-1`} />
            <input type="number" value={newInitial} onChange={(e) => setNewInitial(e.target.value)} placeholder="初始餘額" className={`${field} w-24`} />
            <button onClick={addAccount} disabled={!newName.trim()} className="shrink-0 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">＋</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        餘額 = 初始餘額 + 該帳戶的收入 − 支出 ± 轉帳。信用卡花費會讓餘額變負(代表待繳)。
      </p>
    </div>
  );
}
