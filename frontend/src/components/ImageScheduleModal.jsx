import { useEffect, useRef, useState } from "react";
import { scheduleFromImage, scheduleFromText } from "../api/schedule";
import { createEvent, listEvents } from "../api/events";
import { createSubtask } from "../api/subtasks";
import { listModels } from "../api/models";

const VISION_HINT = /vl|llava|vision|minicpm|moondream|bakllava|gemma3/i;
const pad = (n) => String(n).padStart(2, "0");
const PROVIDERS = [
  ["gpt", "🤖 GPT"],
  ["claude", "✳️ Claude"],
  ["ollama", "🖥 本地模型"],
];
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

// 兩個標題最長的共同片段（至少 2 個字才算像）：「皆豪系統修改更新」vs「皆豪-客製」→「皆豪」
function sharedLen(a, b) {
  const clean = (x) => String(x || "").replace(/[\s\-_－—·・,，.。:：()（）[\]【】]/g, "");
  a = clean(a);
  b = clean(b);
  for (let L = Math.min(a.length, b.length, 8); L >= 2; L--) {
    for (let i = 0; i + L <= a.length; i++) if (b.includes(a.slice(i, i + L))) return L;
  }
  return 0;
}

// 「1.xxx 2.xxx」「xxx、xxx」或一行一項 → 明細陣列
function splitToSubtasks(text) {
  const t = String(text || "").replace(/^[^：:]{0,12}[：:]/, "");
  let parts = t.split(/\n|；|;/);
  if (parts.length < 2) parts = t.split(/(?=\s*\d+[.、)）])/);
  if (parts.length < 2) parts = t.split(/、|，|,/);
  return parts.map((x) => x.replace(/^\s*(?:\d+[.、)）]|[-•*・])\s*/, "").trim()).filter(Boolean);
}

const shortDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
};

function formatRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const date = s.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });
  const t = (d) => d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${t(s)}–${t(e)}`;
}

function toInputValue(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ImageScheduleModal({ open, onClose, onSaved, onOpenFull, initialFile = null, categories = [] }) {
  const [images, setImages] = useState([]); // [{file, url}]
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [visionWarning, setVisionWarning] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total} 分析中
  const [saving, setSaving] = useState(false);
  const [proposals, setProposals] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [hint, setHint] = useState("");
  const [provider, setProvider] = useState(() => lsGet("dispatch.scheduleAI", "gpt"));
  const [mode, setMode] = useState("image"); // image（截圖）/ text（打字描述）
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [existing, setExisting] = useState([]); // 既有行程（可以把明細加進去）
  const [subDraft, setSubDraft] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setProposals(null);
    setEditingIdx(null);
    setHint("");
    setText("");
    setMode(initialFile ? "image" : lsGet("dispatch.scheduleMode", "image"));
    setError("");
    setProgress(null);
    setImages(initialFile ? [{ file: initialFile, url: URL.createObjectURL(initialFile) }] : []);
    listEvents()
      .then((evs) => {
        const from = Date.now() - 30 * 86400000;
        setExisting(evs.filter((e) => new Date(e.start_time).getTime() >= from).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))));
      })
      .catch(() => setExisting([]));
    listModels()
      .then((data) => {
        const list = data.models ?? [];
        setModels(list);
        const vision = list.find((m) => VISION_HINT.test(m));
        setModel(vision ?? list[0] ?? "");
        setVisionWarning(list.length > 0 && !vision);
      })
      .catch(() => setModels([]));
  }, [open]);

  // 貼上截圖（可多次貼、累加）
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter(Boolean);
      if (files.length) addFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  function addFiles(fileList) {
    const added = [...fileList].map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setImages((prev) => [...prev, ...added]);
    setProposals(null);
    setError("");
  }

  function removeImage(idx) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickProvider(p) {
    setProvider(p);
    lsSet("dispatch.scheduleAI", p);
  }
  function pickMode(m) {
    setMode(m);
    lsSet("dispatch.scheduleMode", m);
    setError("");
  }

  function toProposal(ev) {
    return { ...ev, include: true, category_id: "", subtasks: Array.isArray(ev.subtasks) ? ev.subtasks : [], target: "" };
  }

  // 標題像、日期接近的既有行程 → 建議「加到這個行程的明細」
  function suggestTarget(ev) {
    const t = new Date(ev.start_time).getTime();
    let best = null;
    for (const e of existing) {
      const L = sharedLen(ev.title, e.title);
      if (L < 2) continue;
      const days = Math.abs(new Date(e.start_time).getTime() - t) / 86400000;
      if (days > 60) continue;
      const score = L * 10 - days;
      if (!best || score > best.score) best = { e, score };
    }
    return best?.e || null;
  }

  // 打字描述：一次問完
  async function handleText() {
    if (!text.trim()) return;
    setError("");
    setProgress({ done: 0, total: 1 });
    try {
      const data = await scheduleFromText(text.trim(), provider, model || undefined);
      setProposals((data.events ?? []).map(toProposal));
    } catch (e) {
      setError(errOf(e));
    } finally {
      setProgress(null);
    }
  }

  // 截圖：逐張分析、彙整結果
  async function handleParse() {
    if (mode === "text") return handleText();
    if (images.length === 0) return;
    setError("");
    setProgress({ done: 0, total: images.length });
    const all = [];
    let failed = 0;
    let lastErr = "";
    for (let i = 0; i < images.length; i++) {
      try {
        const data = await scheduleFromImage(images[i].file, model || undefined, hint.trim() || undefined, provider);
        for (const ev of data.events ?? []) all.push(toProposal(ev));
      } catch (e) {
        failed += 1;
        lastErr = errOf(e);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
    if (failed === images.length) {
      setError(lastErr || "分析失敗");
      return;
    }
    setProposals(all);
    if (failed > 0) setError(`有 ${failed} 張圖分析失敗（其餘已完成）：${lastErr}`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const ev of proposals.filter((e) => e.include && e.title?.trim())) {
        const subs = (ev.subtasks || []).map((x) => x.trim()).filter(Boolean);
        if (ev.target) {
          // 加到既有行程：每一項變成那個行程的明細（沒有明細就把標題當一項）
          for (const t of subs.length ? subs : [ev.title.trim()]) await createSubtask(Number(ev.target), t);
          continue;
        }
        await createEvent({
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          description: ev.description || "",
          color: ev.color || "#8b5cf6",
          category_id: ev.category_id ? Number(ev.category_id) : null,
          subtasks: subs.length ? subs : undefined,
        });
      }
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function updateProposal(idx, patch) {
    setProposals((p) => p.map((ev, i) => (i === idx ? { ...ev, ...patch } : ev)));
  }
  // 用完整的「新增行程」視窗編輯這一筆：存好後從清單拿掉
  function openFull(idx) {
    const ev = proposals[idx];
    setEditingIdx(null);
    onOpenFull?.(
      {
        title: ev.title,
        start_time: ev.start_time,
        end_time: ev.end_time,
        description: ev.description || "",
        color: ev.color || "#8b5cf6",
        category_id: ev.category_id ? Number(ev.category_id) : undefined,
        pending_subtasks: (ev.subtasks || []).map((x) => x.trim()).filter(Boolean),
      },
      () => setProposals((p) => p.filter((x) => x !== ev))
    );
  }
  function removeProposal(idx) {
    setProposals((p) => p.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }
  function addBlankProposal() {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    setProposals((p) => [
      ...(p ?? []),
      { title: "", start_time: toInputValue(start), end_time: toInputValue(end), description: "", color: "#8b5cf6", include: true, category_id: "", subtasks: [], target: "" },
    ]);
    setEditingIdx(proposals?.length ?? 0);
  }

  if (!open) return null;

  const includedCount = proposals?.filter((e) => e.include && e.title?.trim()).length ?? 0;
  const analyzing = Boolean(progress);
  const inputCls = "w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-black text-slate-900">✨ AI 排程</h2>
          <p className="mt-0.5 text-sm text-slate-400">丟截圖或打字描述，AI 幫你整理成行程，確認後再加入行事曆。</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!proposals && (
            <div className="space-y-3">
              {/* 用哪個 AI */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">用哪個 AI</label>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                  {PROVIDERS.map(([k, label]) => (
                    <button key={k} type="button" onClick={() => pickProvider(k)}
                      className={`rounded-lg py-1.5 text-sm font-semibold transition ${provider === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {provider !== "ollama" && (
                  <p className="mt-1 text-[11px] text-slate-400">走主機上已登入的 {provider === "gpt" ? "Codex（GPT）" : "Claude Code"}，用你的訂閱額度，不另外收費；比本地模型準，一張約 20–60 秒。</p>
                )}
              </div>
              {/* 截圖 / 打字 */}
              <div className="flex gap-1 border-b border-slate-100">
                {[["image", "📷 截圖"], ["text", "✍️ 打字描述"]].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => pickMode(k)}
                    className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-semibold transition ${mode === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 本地模型 */}
          {provider === "ollama" && models.length > 0 && !proposals && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">本地模型{mode === "image" ? "（要選視覺模型）" : ""}</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className={`${inputCls} cursor-pointer`}>
                {models.map((m) => (
                  <option key={m} value={m}>{m}{VISION_HINT.test(m) ? "  👁 視覺" : ""}</option>
                ))}
              </select>
              {visionWarning && mode === "image" && <p className="mt-1.5 text-xs text-amber-600">⚠️ 沒偵測到視覺模型，建議先 <code>ollama pull qwen2.5vl:7b</code>。</p>}
            </div>
          )}

          {/* 打字描述 */}
          {!proposals && mode === "text" && (
            <div>
              <textarea
                rows={6}
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleText();
                }}
                placeholder={"直接打要安排的事，例如：\n明天下午 3 點跟富旺開會 2 小時\n週五整天去台中出差\n下週一到週三每天早上 9 點晨會 30 分鐘"}
                className={`${inputCls} resize-y leading-relaxed`}
              />
              <p className="mt-1 text-[11px] text-slate-400">相對日期（明天、下週三）會用今天推算；Ctrl+Enter 送出</p>
            </div>
          )}

          {/* 圖片區（結果出來後收起） */}
          {!proposals && mode === "image" && (
            <>
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((im, i) => (
                    <div key={i} className="group relative overflow-hidden rounded-lg border border-slate-200">
                      <img src={im.url} alt="" className="h-20 w-full bg-slate-50 object-cover" />
                      <button onClick={() => removeImage(i)} className="absolute right-1 top-1 rounded-md bg-white/90 px-1.5 text-xs font-bold text-red-600 opacity-0 shadow transition group-hover:opacity-100">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const fs = [...(e.dataTransfer?.files ?? [])].filter((x) => x.type.startsWith("image/")); if (fs.length) addFiles(fs); }}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="text-3xl">🖼️</span>
                <span className="text-sm font-medium text-slate-600">Ctrl + V 貼上、拖曳、或點此選圖</span>
                <span className="text-xs text-slate-400">可以一次多張、也可以分次貼上累加</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">補充說明（選填，套用到全部圖片）</label>
                <textarea rows={2} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="例：這些都是這週的待辦，每項排 1 小時" className={inputCls} />
              </div>
            </>
          )}

          {analyzing && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-700">
              {mode === "text" ? "AI 整理中…（約 20–60 秒）" : `AI 逐張分析中… ${progress.done}/${progress.total}`}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100">
                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}

          {/* 結果 */}
          {proposals && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500">AI 共讀到 {proposals.length} 筆（勾選要加入的）</p>
                <button onClick={addBlankProposal} className="rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50">＋ 手動新增</button>
              </div>
              {proposals.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">沒讀到行程，換清楚一點的截圖／描述，或按「＋ 手動新增」。</p>
              ) : (
                <ul className="space-y-2">
                  {proposals.map((ev, i) => {
                    const editing = editingIdx === i;
                    return (
                      <li key={i} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        {editing ? (
                          <div className="space-y-2">
                            <input className={inputCls} placeholder="標題" value={ev.title} autoFocus onChange={(e) => updateProposal(i, { title: e.target.value })} />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="datetime-local" className={inputCls} value={toInputValue(ev.start_time)} onChange={(e) => { const start = e.target.value; updateProposal(i, { start_time: start, ...(toInputValue(ev.end_time) < start ? { end_time: start } : {}) }); }} />
                              <input type="datetime-local" className={inputCls} value={toInputValue(ev.end_time)} min={toInputValue(ev.start_time)} onChange={(e) => updateProposal(i, { end_time: e.target.value })} />
                            </div>
                            <input className={inputCls} placeholder="備註（可留空）" value={ev.description ?? ""} onChange={(e) => updateProposal(i, { description: e.target.value })} />
                            {/* 明細 */}
                            <div className="rounded-lg bg-slate-50 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500">明細 {ev.subtasks.length > 0 && `（${ev.subtasks.length} 項）`}</span>
                                {ev.description?.trim() && splitToSubtasks(ev.description).length > 1 && (
                                  <button type="button" onClick={() => updateProposal(i, { subtasks: [...ev.subtasks, ...splitToSubtasks(ev.description)], description: "" })}
                                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50">備註拆成明細</button>
                                )}
                              </div>
                              <ul className="space-y-1">
                                {ev.subtasks.map((t, j) => (
                                  <li key={j} className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-300">☐</span>
                                    <input className={`${inputCls} py-1 text-xs`} value={t} onChange={(e) => updateProposal(i, { subtasks: ev.subtasks.map((x, k) => (k === j ? e.target.value : x)) })} />
                                    <button type="button" onClick={() => updateProposal(i, { subtasks: ev.subtasks.filter((_, k) => k !== j) })} className="shrink-0 px-1 text-slate-300 hover:text-red-500">✕</button>
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-1 flex gap-1.5">
                                <input className={`${inputCls} py-1 text-xs`} placeholder="新增明細（Enter）" value={subDraft} onChange={(e) => setSubDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter" && subDraft.trim()) { e.preventDefault(); updateProposal(i, { subtasks: [...ev.subtasks, subDraft.trim()] }); setSubDraft(""); } }} />
                              </div>
                            </div>
                            {/* 放到哪裡 */}
                            <div>
                              <label className="mb-1 block text-xs font-bold text-slate-500">放到哪裡</label>
                              <select className={`${inputCls} cursor-pointer`} value={ev.target} onChange={(e) => updateProposal(i, { target: e.target.value })}>
                                <option value="">➕ 新增成一個行程</option>
                                {existing.map((x) => <option key={x.id} value={x.id}>📌 加到既有：{shortDate(x.start_time)} {x.title}</option>)}
                              </select>
                            </div>
                            {categories.length > 0 && (
                              <select className={`${inputCls} cursor-pointer`} value={ev.category_id} onChange={(e) => { const id = e.target.value; const cat = categories.find((c) => String(c.id) === id); updateProposal(i, { category_id: id, ...(cat ? { color: cat.color } : {}) }); }}>
                                <option value="">未分類</option>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            )}
                            <div className="flex justify-end gap-2 pt-0.5">
                              <button onClick={() => removeProposal(i)} className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">刪除</button>
                              {onOpenFull && !ev.target && (
                                <button onClick={() => openFull(i)} className="mr-auto order-first rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50" title="用完整的行程編輯視窗（照片、連結、提醒…）">↗ 完整編輯</button>
                              )}
                              <button onClick={() => { setEditingIdx(null); setSubDraft(""); }} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700">完成</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2.5">
                            <input type="checkbox" checked={ev.include} onChange={() => updateProposal(i, { include: !ev.include })} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600" />
                            <button onClick={() => setEditingIdx(i)} className="min-w-0 flex-1 text-left">
                              <p className={`truncate text-sm font-semibold ${ev.include ? "text-slate-800" : "text-slate-400"}`}>{ev.title || "（未命名，點此編輯）"}</p>
                              {ev.target ? (
                                <p className="text-xs font-semibold text-emerald-600">
                                  → 加到「{existing.find((x) => String(x.id) === String(ev.target))?.title || "既有行程"}」的明細（{ev.subtasks.length || 1} 項）
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400">
                                  {formatRange(ev.start_time, ev.end_time)}
                                  {ev.category_id && categories.find((c) => String(c.id) === String(ev.category_id)) && `　·　${categories.find((c) => String(c.id) === String(ev.category_id)).name}`}
                                </p>
                              )}
                              {ev.subtasks.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {ev.subtasks.slice(0, 6).map((t, j) => <li key={j} className="truncate text-[11px] text-slate-500">☐ {t}</li>)}
                                  {ev.subtasks.length > 6 && <li className="text-[11px] text-slate-400">…還有 {ev.subtasks.length - 6} 項</li>}
                                </ul>
                              )}
                              {!ev.target && (() => {
                                const sug = suggestTarget(ev);
                                return sug ? (
                                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); updateProposal(i, { target: String(sug.id) }); }}
                                    className="mt-1 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
                                    💡 改成加到「{shortDate(sug.start_time)} {sug.title}」的明細？
                                  </span>
                                ) : null;
                              })()}
                            </button>
                            <button onClick={() => setEditingIdx(i)} className="shrink-0 rounded-md px-1.5 text-slate-300 hover:text-indigo-500" title="編輯／分類">✎</button>
                            <button onClick={() => removeProposal(i)} className="shrink-0 rounded-md px-1.5 text-slate-300 hover:text-red-500" title="移除">✕</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100">關閉</button>
          {!proposals ? (
            <button onClick={handleParse} disabled={(mode === "text" ? !text.trim() : images.length === 0) || analyzing} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
              {analyzing
                ? mode === "text" ? "整理中…" : `分析中… ${progress.done}/${progress.total}`
                : mode === "text" ? "✨ 產生行程" : `✨ 開始解析（${images.length} 張）`}
            </button>
          ) : (
            <button onClick={handleSave} disabled={includedCount === 0 || saving} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
              {saving ? "加入中…" : `加入 ${includedCount} 筆`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
