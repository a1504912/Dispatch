import { useEffect, useRef, useState } from "react";
import { createTransaction, ledgerFromImage, ledgerFromText } from "../api/ledger";
import { listAccounts } from "../api/accounts";

// AI 記帳：丟截圖（收據、發票、刷卡通知、LINE Pay、網購訂單…）或打字 → GPT / Claude 整理成記錄 → 確認後加入
const lsGet = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 無痕模式 */
  }
};
const errOf = (e) => {
  const st = e?.response?.status;
  if (st === 524 || st === 504) return "AI 想太久，連線逾時了，請再試一次或少放幾張";
  const d = e?.response?.data?.detail;
  return (typeof d === "string" && d) || e?.message || "失敗";
};
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

export default function LedgerAIModal({ open, initialFile, categories = [], txs = [], onClose, onSaved }) {
  const [provider, setProvider] = useState(() => lsGet("dispatch.ledgerAI", "gpt"));
  const [mode, setMode] = useState("image");
  const [images, setImages] = useState([]);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [progress, setProgress] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError("");
    setProgress(null);
    setSaving(false);
    setText("");
    setHint("");
    setMode(initialFile ? "image" : lsGet("dispatch.ledgerAIMode", "image"));
    setImages(initialFile ? [{ file: initialFile, url: URL.createObjectURL(initialFile) }] : []);
    listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [open, initialFile]);

  // 視窗開著時 Ctrl+V 貼截圖（可多次貼、累加）
  useEffect(() => {
    if (!open) return;
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter(Boolean);
      if (files.length) {
        setMode("image");
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  if (!open) return null;

  const usable = accounts.filter((a) => a.parent_id || !accounts.some((x) => x.parent_id === a.id));
  const tops = (kind) => categories.filter((c) => c.kind === kind && !c.parent_id);
  const subsOf = (kind, name) => {
    const top = tops(kind).find((c) => c.name === name);
    return top ? categories.filter((c) => c.parent_id === top.id) : [];
  };
  const defaultAcc = usable.find((a) => !a.exclude_from_total) || usable[0];

  function addFiles(list) {
    setImages((prev) => [...prev, ...[...list].map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
    setRows(null);
    setError("");
  }

  // AI 的結果 → 可編輯的列；同一天、同金額已經有記錄的先不勾（可能重複）
  function toRows(items) {
    return items.map((it) => {
      const acc = usable.find((a) => a.name === it.account) || defaultAcc;
      const dup = txs.some((t) => t.date === it.date && Math.abs(Math.abs(Number(t.amount)) - it.amount) < 0.5 && t.kind === it.kind);
      return { ...it, account_id: acc?.id ?? null, include: !dup, dup };
    });
  }

  async function run() {
    setError("");
    if (mode === "text") {
      if (!text.trim()) return;
      setProgress({ done: 0, total: 1 });
      try {
        setRows(toRows(await ledgerFromText(text.trim(), provider)));
      } catch (e) {
        setError(errOf(e));
      } finally {
        setProgress(null);
      }
      return;
    }
    if (!images.length) return;
    setProgress({ done: 0, total: images.length });
    const all = [];
    let failed = 0;
    let lastErr = "";
    for (let i = 0; i < images.length; i++) {
      try {
        all.push(...(await ledgerFromImage(images[i].file, provider, hint.trim())));
      } catch (e) {
        failed += 1;
        lastErr = errOf(e);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
    if (failed === images.length) return setError(lastErr || "分析失敗");
    setRows(toRows(all));
    if (failed) setError(`有 ${failed} 張分析失敗（其餘已完成）：${lastErr}`);
  }

  const upd = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const chosen = (rows || []).filter((r) => r.include && Number(r.amount) > 0);

  async function save() {
    setSaving(true);
    setError("");
    let ok = 0;
    try {
      for (const r of chosen) {
        const acc = accounts.find((a) => a.id === r.account_id);
        await createTransaction({
          kind: r.kind,
          amount: Number(r.amount),
          category: r.category || "其他",
          subcategory: r.subcategory || "",
          note: r.note || "",
          date: r.date,
          account: acc?.name || "",
          account_id: r.account_id ?? null,
        });
        ok += 1;
      }
      onSaved(ok);
    } catch (e) {
      setError(`已存 ${ok} 筆，第 ${ok + 1} 筆失敗：${errOf(e)}`);
      setSaving(false);
    }
  }

  const baseCls = "min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-400";
  const inputCls = `w-full ${baseCls}`;
  const analyzing = Boolean(progress);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">📷 AI 記帳</h2>
          <p className="mt-0.5 text-sm text-slate-400">收據、發票、刷卡通知、LINE Pay、網購訂單截圖，或直接打字，AI 幫你填好再確認。</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!rows && (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {[["gpt", "🤖 GPT"], ["claude", "✳️ Claude"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => { setProvider(k); lsSet("dispatch.ledgerAI", k); }}
                    className={`rounded-lg py-1.5 text-sm font-semibold transition ${provider === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
                ))}
              </div>
              <div className="flex gap-1 border-b border-slate-100">
                {[["image", "📷 截圖"], ["text", "✍️ 打字"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => { setMode(k); lsSet("dispatch.ledgerAIMode", k); setError(""); }}
                    className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-semibold ${mode === k ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>{l}</button>
                ))}
              </div>
              {mode === "image" ? (
                <>
                  {images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((im, i) => (
                        <div key={i} className="group relative overflow-hidden rounded-lg border border-slate-200">
                          <img src={im.url} alt="" className="h-20 w-full bg-slate-50 object-cover" />
                          <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-md bg-white/90 px-1.5 text-xs font-bold text-red-600 shadow">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const fs = [...(e.dataTransfer?.files ?? [])].filter((x) => x.type.startsWith("image/")); if (fs.length) addFiles(fs); }}
                    className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 hover:border-emerald-300 hover:bg-emerald-50/40"
                  >
                    <span className="text-3xl">🧾</span>
                    <span className="text-sm font-medium text-slate-600">Ctrl + V 貼上、拖曳、或點此選圖</span>
                    <span className="text-xs text-slate-400">可以一次多張；手機可以直接拍收據</span>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const l = [...e.target.files]; e.target.value = ""; if (l.length) addFiles(l); }} />
                  <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="補充說明（選填），例：這是公司聚餐，我只付 500" className={inputCls} />
                </>
              ) : (
                <textarea
                  autoFocus
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && run()}
                  placeholder={"直接打，例如：\n早餐 蛋餅 45 現金\n昨天加油 1200 刷卡\n薪水入帳 48000"}
                  className={`${inputCls} resize-y leading-relaxed`}
                />
              )}
            </>
          )}

          {analyzing && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {mode === "text" ? "AI 整理中…（約 20–60 秒）" : `AI 分析中… ${progress.done}/${progress.total}`}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                <div className="h-full animate-pulse rounded-full bg-emerald-500" style={{ width: `${Math.max(15, (progress.done / progress.total) * 100)}%` }} />
              </div>
            </div>
          )}
          {error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</p>}

          {rows && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500">AI 讀到 {rows.length} 筆（勾選要加入的，都可以改）</p>
                <button onClick={() => setRows(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">‹ 重新分析</button>
              </div>
              {rows.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">沒讀到收支，換清楚一點的截圖或改用打字。</p>}
              <ul className="space-y-2">
                {rows.map((r, i) => (
                  <li key={i} className={`rounded-xl p-2.5 ring-1 ${r.include ? "bg-white ring-emerald-200" : "bg-slate-50 ring-slate-100"}`}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input type="checkbox" checked={r.include} onChange={() => upd(i, { include: !r.include })} className="h-4 w-4 accent-emerald-600" />
                      <select value={r.kind} onChange={(e) => upd(i, { kind: e.target.value, category: tops(e.target.value).find((c) => c.name === "其他")?.name || tops(e.target.value)[0]?.name || "", subcategory: "" })}
                        className={`rounded-lg border px-2 py-1.5 text-sm font-bold ${r.kind === "income" ? "border-emerald-200 text-emerald-600" : "border-rose-200 text-rose-600"}`}>
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                      </select>
                      <input type="number" inputMode="decimal" value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} className={`${baseCls} w-28 font-bold`} />
                      <input type="date" value={r.date} onChange={(e) => upd(i, { date: e.target.value })} className={`${baseCls} w-40`} />
                      {r.dup && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700" title="同一天已經有一筆一樣金額的記錄">可能重複</span>}
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <select value={r.category} onChange={(e) => upd(i, { category: e.target.value, subcategory: "" })} className={inputCls}>
                        {tops(r.kind).map((c) => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
                      </select>
                      <select value={r.subcategory} onChange={(e) => upd(i, { subcategory: e.target.value })} className={inputCls}>
                        <option value="">（不分）</option>
                        {subsOf(r.kind, r.category).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                      <select value={r.account_id ?? ""} onChange={(e) => upd(i, { account_id: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                        {usable.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                      </select>
                      <input value={r.note} onChange={(e) => upd(i, { note: e.target.value })} placeholder="備註" className={inputCls} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
          {rows && chosen.length > 0 && (
            <span className="text-xs text-slate-500">
              支出 {money(chosen.filter((r) => r.kind === "expense").reduce((s, r) => s + Number(r.amount), 0))}
              {chosen.some((r) => r.kind === "income") && `・收入 ${money(chosen.filter((r) => r.kind === "income").reduce((s, r) => s + Number(r.amount), 0))}`}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">關閉</button>
          {!rows ? (
            <button onClick={run} disabled={analyzing || (mode === "text" ? !text.trim() : !images.length)} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-40">
              {analyzing ? "分析中…" : mode === "text" ? "✨ 整理成記錄" : `✨ 開始辨識（${images.length} 張）`}
            </button>
          ) : (
            <button onClick={save} disabled={saving || !chosen.length} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-40">
              {saving ? "加入中…" : `加入 ${chosen.length} 筆`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
