import { useEffect, useState } from "react";
import {
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  chargeSubscriptionNow,
} from "../api/subscriptions";
import { listAccounts } from "../api/accounts";

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const EMOJIS = ["🔁", "🎬", "🎵", "📺", "🎮", "☁️", "📰", "💪", "🧠", "📦", "🚗", "🏠"];

const cycleLabel = (s) =>
  s.cycle === "yearly" ? `每年 ${s.month}/${s.day}` : `每月 ${s.day} 號`;
const mdShort = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "—");

export default function Subscriptions({ categories = [], onChanged }) {
  const [subs, setSubs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState(null); // 表單物件 或 null
  const [busy, setBusy] = useState(false);

  function load() {
    listSubscriptions().then(setSubs).catch(() => setSubs([]));
  }
  useEffect(() => {
    load();
    listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const expCats = categories.filter((c) => c.kind === "expense" && !c.parent_id);
  const usableAccounts = accounts.filter(
    (a) => a.parent_id || !accounts.some((x) => x.parent_id === a.id)
  );

  const monthlyTotal = subs
    .filter((s) => s.active)
    .reduce((sum, s) => sum + (s.cycle === "yearly" ? s.amount / 12 : s.amount), 0);

  function openNew() {
    setEditing({
      name: "",
      emoji: "🔁",
      amount: "",
      category: "訂閱",
      subcategory: "",
      account: usableAccounts[0]?.name || "",
      account_id: usableAccounts[0]?.id || null,
      cycle: "monthly",
      day: 1,
      month: 1,
      note: "",
      active: true,
    });
  }

  async function save() {
    const f = editing;
    if (!f.name.trim() || !(Number(f.amount) > 0)) return;
    setBusy(true);
    try {
      const payload = {
        ...f,
        amount: Number(f.amount),
        day: Math.max(1, Math.min(31, Number(f.day) || 1)),
        month: Math.max(1, Math.min(12, Number(f.month) || 1)),
      };
      if (f.id) await updateSubscription(f.id, payload);
      else await createSubscription(payload);
      setEditing(null);
      load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s) {
    await updateSubscription(s.id, { ...s, active: !s.active });
    load();
  }
  async function remove(s) {
    if (!window.confirm(`刪除訂閱「${s.name}」？（已記過的帳不會被刪）`)) return;
    await deleteSubscription(s.id);
    load();
  }
  async function chargeNow(s) {
    await chargeSubscriptionNow(s.id);
    onChanged?.();
    window.alert(`已記一筆：${s.name} ${money(s.amount)}`);
  }

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-4">
      {/* 摘要 + 新增 */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 px-5 py-4 text-white shadow-sm">
        <div>
          <p className="text-xs font-medium text-white/60">每月訂閱總支出（約）</p>
          <p className="text-2xl font-black">{money(monthlyTotal)}</p>
        </div>
        <button onClick={openNew} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/25 active:scale-95">
          ＋ 新增訂閱
        </button>
      </div>

      {/* 清單 */}
      {subs.length === 0 ? (
        <div className="rounded-2xl bg-white py-14 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-3xl">🔁</p>
          <p className="mt-2 text-sm text-slate-400">還沒有訂閱。按「新增訂閱」把 Netflix、Spotify… 加進來，到扣款日會自動記帳。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <div key={s.id} className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 ${!s.active && "opacity-50"}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-xl">{s.emoji}</span>
              <button onClick={() => setEditing({ ...s, amount: String(s.amount) })} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-bold text-slate-800">{s.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {cycleLabel(s)} · 下次 {mdShort(s.next_date)}
                  {s.account && ` · ${s.account}`}
                </p>
              </button>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-slate-800">{money(s.amount)}</p>
                <button onClick={() => chargeNow(s)} className="text-[11px] font-semibold text-emerald-600 hover:underline">立即記一筆</button>
              </div>
              <label className="ml-1 inline-flex cursor-pointer items-center" title={s.active ? "啟用中" : "已暫停"}>
                <input type="checkbox" checked={s.active} onChange={() => toggle(s)} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-slate-200 p-0.5 transition peer-checked:bg-emerald-500">
                  <span className={`block h-4 w-4 rounded-full bg-white transition ${s.active ? "translate-x-4" : ""}`} />
                </span>
              </label>
              <button onClick={() => remove(s)} className="shrink-0 px-1 text-slate-300 hover:text-rose-500" title="刪除">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 新增/編輯表單 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setEditing(null)}>
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">{editing.id ? "編輯訂閱" : "新增訂閱"}</h2>
              <button onClick={() => setEditing(null)} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <div className="flex gap-2">
                <div className="flex flex-wrap gap-1">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => setEditing({ ...editing, emoji: e })}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${editing.emoji === e ? "bg-indigo-100 ring-1 ring-indigo-300" : "bg-slate-50"}`}>{e}</button>
                  ))}
                </div>
              </div>
              <input className={`${field} w-full`} placeholder="名稱（例：Netflix）" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input type="number" inputMode="decimal" className={`${field} w-full pl-7 text-lg font-bold`} placeholder="金額" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
              </div>

              {/* 週期 */}
              <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
                {[["monthly", "每月"], ["yearly", "每年"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setEditing({ ...editing, cycle: k })}
                    className={`flex-1 rounded-lg px-3 py-1.5 transition ${editing.cycle === k ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                {editing.cycle === "yearly" && (
                  <>
                    <span className="text-slate-500">每年</span>
                    <select className={field} value={editing.month} onChange={(e) => setEditing({ ...editing, month: Number(e.target.value) })}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
                    </select>
                  </>
                )}
                {editing.cycle === "monthly" && <span className="text-slate-500">每月</span>}
                <select className={field} value={editing.day} onChange={(e) => setEditing({ ...editing, day: Number(e.target.value) })}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d} 號</option>)}
                </select>
                <span className="text-xs text-slate-400">扣款</span>
              </div>

              {/* 分類 */}
              <div>
                <p className="mb-1 text-xs font-bold text-slate-500">分類</p>
                <div className="flex flex-wrap gap-1.5">
                  {expCats.map((c) => (
                    <button key={c.id ?? c.name} type="button" onClick={() => setEditing({ ...editing, category: c.name })}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${editing.category === c.name ? "bg-indigo-600 text-white shadow" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"}`}>
                      {c.emoji} {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 帳戶 */}
              <div>
                <p className="mb-1 text-xs font-bold text-slate-500">帳戶</p>
                <select className={`${field} w-full`} value={editing.account_id ?? ""} onChange={(e) => {
                  const a = usableAccounts.find((x) => x.id === Number(e.target.value));
                  setEditing({ ...editing, account_id: a?.id ?? null, account: a?.name ?? "" });
                }}>
                  <option value="">不指定</option>
                  {usableAccounts.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                </select>
              </div>

              <input className={`${field} w-full`} placeholder="備註（可留空，會當作記帳的備註）" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
              <span className="text-xs text-slate-400">到扣款日主機會自動記一筆並通知你</span>
              <button onClick={save} disabled={busy || !editing.name.trim() || !(Number(editing.amount) > 0)}
                className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-2 text-sm font-bold text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-40">
                {busy ? "儲存中…" : editing.id ? "儲存" : "新增"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
