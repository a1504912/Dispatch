import { useEffect, useState } from "react";
import {
  confirmQuick, dismissQuick, quickEntries, quickSettings, rotateQuickKey, saveQuickSettings, sendQuickTest, undoQuick,
} from "../api/ledger";

// 手機通知自動記帳：安卓 MacroDroid 收到付款通知 → 送到主機 → 自動記帳（或先待確認）
const STATUS = {
  recorded: ["已記帳", "bg-emerald-50 text-emerald-700"],
  pending: ["待確認", "bg-amber-50 text-amber-700"],
  processing: ["處理中", "bg-sky-50 text-sky-600"],
  ignored: ["略過", "bg-slate-100 text-slate-500"],
  duplicate: ["重複略過", "bg-slate-100 text-slate-500"],
  undone: ["已復原", "bg-slate-100 text-slate-500"],
  error: ["錯誤", "bg-rose-50 text-rose-600"],
};
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const fmtTime = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function CopyRow({ label, value, mono = true }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-bold text-slate-400">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className={`min-w-0 flex-1 break-all rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</code>
        <button onClick={async () => { await copy(value); setOk(true); setTimeout(() => setOk(false), 1200); }} className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-emerald-600">
          {ok ? "✓ 已複製" : "複製"}
        </button>
      </div>
    </div>
  );
}

function ConfirmForm({ e, categories, accounts, onDone, onCancel }) {
  const usable = accounts.filter((a) => a.parent_id || !accounts.some((x) => x.parent_id === a.id));
  const [f, setF] = useState({ kind: e.kind || "expense", amount: e.amount ?? "", category: e.category || "其他", subcategory: e.subcategory || "", account_id: e.account_id ?? usable[0]?.id ?? null, note: e.merchant || "" });
  const tops = categories.filter((c) => c.kind === f.kind && !c.parent_id);
  const subs = categories.filter((c) => c.parent_id && tops.find((t) => t.id === c.parent_id)?.name === f.category);
  const cls = "min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm";
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-emerald-50/60 p-2.5 ring-1 ring-emerald-100">
      <div className="flex flex-wrap gap-1.5">
        <select value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value, category: "其他", subcategory: "" })} className={cls}>
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>
        <input type="number" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} className={`${cls} w-24 font-bold`} />
        <select value={f.category} onChange={(ev) => setF({ ...f, category: ev.target.value, subcategory: "" })} className={cls}>
          {tops.map((c) => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
        </select>
        <select value={f.subcategory} onChange={(ev) => setF({ ...f, subcategory: ev.target.value })} className={cls}>
          <option value="">（不分）</option>
          {subs.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={f.account_id ?? ""} onChange={(ev) => setF({ ...f, account_id: Number(ev.target.value) })} className={cls}>
          {usable.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
        </select>
        <input value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} placeholder="備註／店家" className={`${cls} flex-1`} />
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-white">取消</button>
        <button disabled={busy || !(Number(f.amount) > 0)} onClick={async () => { setBusy(true); try { await confirmQuick(e.id, { ...f, amount: Number(f.amount) }); onDone(); } finally { setBusy(false); } }}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">記帳</button>
      </div>
    </div>
  );
}

export default function QuickLedger({ open, categories, accounts, onClose, onChanged }) {
  const [tab, setTab] = useState("log");
  const [cfg, setCfg] = useState(null);
  const [entries, setEntries] = useState([]);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const usable = accounts.filter((a) => a.parent_id || !accounts.some((x) => x.parent_id === a.id));

  function loadEntries() {
    return quickEntries().then(setEntries).catch(() => {});
  }
  useEffect(() => {
    if (!open) return;
    setMsg("");
    quickSettings().then((c) => {
      setCfg(c);
      if (!entries.length) quickEntries().then((es) => { setEntries(es); if (!es.length) setTab("guide"); }).catch(() => {});
    }).catch((e) => setMsg(e?.response?.data?.detail || "讀取設定失敗"));
    const t = setInterval(loadEntries, 8000); // 開著時自動更新（手機剛送來的會出現）
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const hookUrl = `${window.location.origin}/api/quick-ledger/hook`;
  const isQuickTunnel = window.location.hostname.endsWith("trycloudflare.com");
  const after = () => { loadEntries(); onChanged?.(); };
  async function save(next) {
    setCfg(next);
    try {
      setCfg({ ...next, ...(await saveQuickSettings(next)) });
      setMsg("✓ 已儲存");
      setTimeout(() => setMsg(""), 1500);
    } catch (e) {
      setMsg(e?.response?.data?.detail || "儲存失敗");
    }
  }
  const body = `{"source":"[app_name]","title":"[notification_title]","text":"[notification]"}`;
  const chip = (on) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`;
  const pending = entries.filter((e) => e.status === "pending").length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[86vh] sm:rounded-2xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-lg font-black text-slate-900">📲 手機通知自動記帳</h2>
          {cfg && (
            <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={cfg.enabled} onChange={(ev) => save({ ...cfg, enabled: ev.target.checked })} className="h-4 w-4 accent-emerald-600" />
              {cfg.enabled ? "開啟中" : "已暫停"}
            </label>
          )}
          <button onClick={onClose} className="ml-auto rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex gap-1 border-b border-slate-100 bg-slate-50 px-5 py-2">
          <div className="flex rounded-xl bg-slate-100 p-0.5">
            <button onClick={() => setTab("log")} className={chip(tab === "log")}>紀錄{pending > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pending}</span>}</button>
            <button onClick={() => setTab("settings")} className={chip(tab === "settings")}>設定</button>
            <button onClick={() => setTab("guide")} className={chip(tab === "guide")}>手機設定教學</button>
          </div>
          {msg && <span className="ml-auto self-center text-xs text-emerald-600">{msg}</span>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "log" && (
            <>
              {entries.length === 0 && <p className="py-12 text-center text-sm text-slate-400">還沒收到手機送來的通知。先到「手機設定教學」設定 MacroDroid。</p>}
              <ul className="space-y-2">
                {entries.map((e) => {
                  const [label, cls] = STATUS[e.status] || [e.status, "bg-slate-100 text-slate-500"];
                  const acc = accounts.find((a) => a.id === e.account_id);
                  return (
                    <li key={e.id} className="rounded-xl p-3 ring-1 ring-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
                        <span className="text-xs text-slate-400">{fmtTime(e.created_at)}{e.source && `・${e.source}`}</span>
                        {e.amount != null && (
                          <span className={`ml-auto text-sm font-black ${e.kind === "income" ? "text-emerald-600" : "text-slate-800"}`}>{e.kind === "income" ? "+" : "−"}{money(e.amount)}</span>
                        )}
                      </div>
                      {(e.category || e.merchant) && (
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {e.category}{e.subcategory && `・${e.subcategory}`}
                          {e.merchant && <span className="font-normal text-slate-500">　{e.merchant}</span>}
                          {acc && <span className="font-normal text-slate-400">　{acc.emoji}{acc.name}</span>}
                        </p>
                      )}
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-slate-400">{e.raw_text}</p>
                      {e.message && <p className="mt-0.5 text-[11px] text-slate-400">💬 {e.message}</p>}
                      <div className="mt-1.5 flex gap-1.5">
                        {e.status === "recorded" && (
                          <button onClick={async () => { await undoQuick(e.id); after(); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50">↩ 復原（刪掉這筆記帳）</button>
                        )}
                        {["pending", "ignored", "duplicate", "undone", "error"].includes(e.status) && editId !== e.id && (
                          <button onClick={() => setEditId(e.id)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700">{e.status === "pending" ? "確認記帳" : "還是要記"}</button>
                        )}
                        <button onClick={async () => { await dismissQuick(e.id); loadEntries(); }} className="ml-auto rounded-lg px-2 py-1 text-xs text-slate-300 hover:text-slate-500" title="只刪這則紀錄（已記的帳不會動）">移除</button>
                      </div>
                      {editId === e.id && (
                        <ConfirmForm e={e} categories={categories} accounts={accounts} onCancel={() => setEditId(null)} onDone={() => { setEditId(null); after(); }} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === "settings" && cfg && (
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 text-xs font-bold text-slate-500">收到付款通知後</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[["auto", "⚡ 直接記帳", "記完推播通知你，記錯可以一鍵復原"], ["confirm", "📥 先放待確認", "到這裡按「確認記帳」才會記"]].map(([k, l, d]) => (
                    <button key={k} onClick={() => save({ ...cfg, mode: k })} className={`rounded-xl p-3 text-left ring-1 ${cfg.mode === k ? "bg-emerald-50 ring-emerald-300" : "ring-slate-200 hover:bg-slate-50"}`}>
                      <p className="text-sm font-bold text-slate-800">{l}</p>
                      <p className="text-xs text-slate-500">{d}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold text-slate-500">分類怎麼判斷</p>
                <p className="mb-1.5 text-xs text-slate-400">先找以前同一家店記過的分類（例：全家→餐飲・飲料）；沒記過的話：</p>
                <div className="flex flex-wrap gap-1.5">
                  {[["off", "先記「其他」"], ["gpt", "🤖 問 GPT"], ["claude", "✳️ 問 Claude"]].map(([k, l]) => (
                    <button key={k} onClick={() => save({ ...cfg, ai: k })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${cfg.ai === k ? "bg-slate-900 text-white ring-slate-900" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>{l}</button>
                  ))}
                </div>
                {cfg.ai !== "off" && <p className="mt-1 text-[11px] text-slate-400">走主機上已登入的 CLI，不另外收費；AI 判斷約 20–60 秒，手機那邊不用等。</p>}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold text-slate-500">記到哪個帳戶</p>
                <div className="space-y-1.5">
                  {Object.entries(cfg.source_accounts || {}).map(([src, accId], i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input defaultValue={src} onBlur={(ev) => {
                        const next = Object.fromEntries(Object.entries(cfg.source_accounts).map(([k, v]) => (k === src ? [ev.target.value.trim(), v] : [k, v])).filter(([k]) => k));
                        save({ ...cfg, source_accounts: next });
                      }} placeholder="通知來源（App 名稱關鍵字）" className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <span className="text-slate-300">→</span>
                      <select value={accId} onChange={(ev) => save({ ...cfg, source_accounts: { ...cfg.source_accounts, [src]: Number(ev.target.value) } })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                        {usable.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                      </select>
                      <button onClick={() => { const n = { ...cfg.source_accounts }; delete n[src]; save({ ...cfg, source_accounts: n }); }} className="px-1.5 text-slate-300 hover:text-rose-500">✕</button>
                    </div>
                  ))}
                  <button onClick={() => {
                    const name = window.prompt("通知來源的 App 名稱（或其中幾個字），例：LINE、國泰世華、Google 錢包");
                    if (name?.trim() && usable[0]) save({ ...cfg, source_accounts: { ...cfg.source_accounts, [name.trim()]: usable[0].id } });
                  }} className="text-xs font-semibold text-emerald-700 hover:underline">＋ 新增對應（例：LINE → LINE PAY、國泰世華 → 信用卡）</button>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="w-40 text-sm text-slate-500">其他來源預設</span>
                    <span className="text-slate-300">→</span>
                    <select value={cfg.default_account_id ?? ""} onChange={(ev) => save({ ...cfg, default_account_id: ev.target.value ? Number(ev.target.value) : null })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                      <option value="">（不指定）</option>
                      {usable.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={cfg.notify} onChange={(ev) => save({ ...cfg, notify: ev.target.checked })} className="h-4 w-4 accent-emerald-600" />
                記帳後推播通知我（點通知會打開這裡，可以馬上改或復原）
              </label>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                🔁 同一筆消費常會來兩個通知（例：Google 錢包感應＋銀行刷卡通知），15 分鐘內同金額的第二則會自動略過，不會記兩次。聊天訊息（沒有付款字眼、也沒有 NT$ 金額）會略過。
              </p>
            </div>
          )}

          {tab === "guide" && cfg && (
            <div className="space-y-4 text-sm text-slate-700">
              {isQuickTunnel && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠️ 你現在是用 Cloudflare 臨時網址開的，這個網址主機重開就會變，手機的設定會失效。建議手機裝 Tailscale，網址改用 Tailscale 的（例：https://你的主機.ts.net）。
                </p>
              )}
              <CopyRow label="網址（URL）" value={hookUrl} />
              <CopyRow label="標頭名稱" value="X-Api-Key" />
              <div>
                <CopyRow label="金鑰（只給你自己的手機用，外流就按「換新金鑰」）" value={cfg.key} />
                <button onClick={async () => {
                  if (!window.confirm("換新金鑰？手機上的 MacroDroid 要改成新的才能繼續記帳。")) return;
                  const { key } = await rotateQuickKey();
                  setCfg({ ...cfg, key });
                }} className="mt-1 text-xs text-slate-400 hover:text-rose-500">🔄 換新金鑰</button>
              </div>
              <CopyRow label="內容（JSON）" value={body} />

              <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
                <li>在 Play 商店安裝 <b>MacroDroid</b>（免費版可以建 5 個巨集），第一次會要求「通知存取權」，請允許。</li>
                <li>新增巨集 →「觸發條件」→ <b>通知 → 通知已收到</b> → 選要監聽的 App（例：Google 錢包、LINE、國泰世華 CUBE、街口…）。
                  <span className="block text-xs text-slate-500">LINE 會有一般聊天訊息，建議在「文字內容」填 <code>LINE Pay</code>，只抓付款通知。</span>
                </li>
                <li>「動作」→ <b>網路 → HTTP 請求</b>：方法選 <b>POST</b>，網址貼上上面的網址。</li>
                <li>「標頭」新增一筆：名稱 <code>X-Api-Key</code>、值貼上金鑰。</li>
                <li>「內容」類型選 <b>application/json</b>，貼上上面的內容。<code>[app_name]</code>、<code>[notification_title]</code>、<code>[notification]</code> 是 MacroDroid 的變數（App 名稱、通知標題、通知文字）；若名稱不同，用內容框旁的「…」按鈕插入對應的變數即可。</li>
                <li>儲存巨集。之後付款收到通知，就會自動記帳，並推播「📲 已自動記帳」給你。</li>
              </ol>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="mb-1.5 text-xs font-bold text-slate-500">先在這裡試試看（模擬一則通知）</p>
                <button onClick={async () => {
                  await sendQuickTest(cfg.key, { source: "測試", title: "LINE Pay", text: "已完成付款。商店名稱：測試商店 付款金額：NT$1" });
                  setTab("log");
                  setTimeout(loadEntries, 800);
                }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">📤 送一則測試通知（$1）</button>
                <span className="ml-2 text-[11px] text-slate-400">看完記得在紀錄裡按「復原」刪掉</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
