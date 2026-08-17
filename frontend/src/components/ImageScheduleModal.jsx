import { useEffect, useRef, useState } from "react";
import { scheduleFromImage } from "../api/schedule";
import { createEvent } from "../api/events";
import { listModels } from "../api/models";

const VISION_HINT = /vl|llava|vision|minicpm|moondream|bakllava|gemma3/i;
const pad = (n) => String(n).padStart(2, "0");

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

export default function ImageScheduleModal({ open, onClose, onSaved, initialFile = null, categories = [] }) {
  const [images, setImages] = useState([]); // [{file, url}]
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [visionWarning, setVisionWarning] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total} 分析中
  const [saving, setSaving] = useState(false);
  const [proposals, setProposals] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setProposals(null);
    setEditingIdx(null);
    setHint("");
    setError("");
    setProgress(null);
    setImages(initialFile ? [{ file: initialFile, url: URL.createObjectURL(initialFile) }] : []);
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

  // 逐張分析、彙整結果
  async function handleParse() {
    if (images.length === 0) return;
    setError("");
    setProgress({ done: 0, total: images.length });
    const all = [];
    let failed = 0;
    for (let i = 0; i < images.length; i++) {
      try {
        const data = await scheduleFromImage(images[i].file, model || undefined, hint.trim() || undefined);
        for (const ev of data.events ?? []) all.push({ ...ev, include: true, category_id: "" });
      } catch {
        failed += 1;
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
    setProposals(all);
    if (failed > 0) setError(`有 ${failed} 張圖分析失敗（其餘已完成）。`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const ev of proposals.filter((e) => e.include && e.title?.trim())) {
        await createEvent({
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          description: ev.description || "",
          color: ev.color || "#8b5cf6",
          category_id: ev.category_id ? Number(ev.category_id) : null,
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
      { title: "", start_time: toInputValue(start), end_time: toInputValue(end), description: "", color: "#8b5cf6", include: true, category_id: "" },
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
          <h2 className="text-lg font-black text-slate-900">📷 截圖排程</h2>
          <p className="mt-0.5 text-sm text-slate-400">貼上或選擇多張截圖，AI 逐張分析，彙整後由你挑選、編輯、分類。</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* 模型 */}
          {models.length > 0 && !proposals && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">視覺模型</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className={`${inputCls} cursor-pointer`}>
                {models.map((m) => (
                  <option key={m} value={m}>{m}{VISION_HINT.test(m) ? "  👁 視覺" : ""}</option>
                ))}
              </select>
              {visionWarning && <p className="mt-1.5 text-xs text-amber-600">⚠️ 沒偵測到視覺模型，建議先 <code>ollama pull qwen2.5vl:7b</code>。</p>}
            </div>
          )}

          {/* 圖片區（結果出來後收起） */}
          {!proposals && (
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
              AI 逐張分析中… {progress.done}/{progress.total}
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
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">沒讀到行程，換清楚一點的截圖，或按「＋ 手動新增」。</p>
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
                            {categories.length > 0 && (
                              <select className={`${inputCls} cursor-pointer`} value={ev.category_id} onChange={(e) => { const id = e.target.value; const cat = categories.find((c) => String(c.id) === id); updateProposal(i, { category_id: id, ...(cat ? { color: cat.color } : {}) }); }}>
                                <option value="">未分類</option>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            )}
                            <div className="flex justify-end gap-2 pt-0.5">
                              <button onClick={() => removeProposal(i)} className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">刪除</button>
                              <button onClick={() => setEditingIdx(null)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700">完成</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2.5">
                            <input type="checkbox" checked={ev.include} onChange={() => updateProposal(i, { include: !ev.include })} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600" />
                            <button onClick={() => setEditingIdx(i)} className="min-w-0 flex-1 text-left">
                              <p className={`truncate text-sm font-semibold ${ev.include ? "text-slate-800" : "text-slate-400"}`}>{ev.title || "（未命名，點此編輯）"}</p>
                              <p className="text-xs text-slate-400">
                                {formatRange(ev.start_time, ev.end_time)}
                                {ev.category_id && categories.find((c) => String(c.id) === String(ev.category_id)) && `　·　${categories.find((c) => String(c.id) === String(ev.category_id)).name}`}
                              </p>
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
            <button onClick={handleParse} disabled={images.length === 0 || analyzing} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
              {analyzing ? `分析中… ${progress.done}/${progress.total}` : `✨ 開始解析（${images.length} 張）`}
            </button>
          ) : (
            <button onClick={handleSave} disabled={includedCount === 0 || saving} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
              {saving ? "加入中…" : `加入 ${includedCount} 筆到行事曆`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
