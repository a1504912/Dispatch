import { useEffect, useRef, useState } from "react";
import { scheduleFromImage } from "../api/schedule";
import { createEvent } from "../api/events";
import { listModels } from "../api/models";

// 判斷一個模型名稱看起來像不像「視覺模型」
const VISION_HINT = /vl|llava|vision|minicpm|moondream|bakllava|gemma3/i;

function formatRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const date = s.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });
  const t = (d) => d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${t(s)}–${t(e)}`;
}

const pad = (n) => String(n).padStart(2, "0");

// Date 或 ISO 字串 → datetime-local 的 "YYYY-MM-DDTHH:MM"
function toInputValue(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function ImageScheduleModal({ open, onClose, onSaved, initialFile = null }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [visionWarning, setVisionWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposals, setProposals] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // 重置 + 載入可用模型（若是從外部貼上開啟的，直接帶入那張圖）
  useEffect(() => {
    if (!open) return;
    setProposals(null);
    setEditingIdx(null);
    setError("");
    if (initialFile) {
      pickFile(initialFile);
    } else {
      setFile(null);
      setPreviewUrl("");
    }
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

  // 支援直接貼上截圖
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) pickFile(item.getAsFile());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setProposals(null);
    setError("");
  }

  async function handleParse() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const data = await scheduleFromImage(file, model || undefined);
      setProposals(data.events ?? []);
    } catch (err) {
      setError(
        err?.response?.data?.detail ??
          "解析失敗，請確認 Ollama 有安裝視覺模型（例如 qwen2.5vl:7b）。"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // 略過沒有標題的空白項
      for (const ev of proposals.filter((e) => e.title?.trim())) {
        await createEvent(ev);
      }
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function removeProposal(idx) {
    setProposals((p) => p.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }

  function updateProposal(idx, patch) {
    setProposals((p) => p.map((ev, i) => (i === idx ? { ...ev, ...patch } : ev)));
  }

  function addBlankProposal() {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    setProposals((p) => [
      ...(p ?? []),
      {
        title: "",
        start_time: toInputValue(start),
        end_time: toInputValue(end),
        description: "",
        color: "#8b5cf6",
      },
    ]);
    setEditingIdx(proposals?.length ?? 0);
  }

  if (!open) return null;

  const validCount = proposals?.filter((e) => e.title?.trim()).length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-black text-slate-900">📷 截圖排程</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            上傳或貼上截圖（Ctrl+V），AI 會自動讀出行程並排進行事曆。
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* 模型選擇 */}
          {models.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">視覺模型</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                    {VISION_HINT.test(m) ? "  👁 視覺" : ""}
                  </option>
                ))}
              </select>
              {visionWarning && (
                <p className="mt-1.5 text-xs text-amber-600">
                  ⚠️ 沒偵測到視覺模型，建議先 <code>ollama pull qwen2.5vl:7b</code>。
                </p>
              )}
            </div>
          )}

          {/* 圖片上傳 / 預覽 */}
          {!previewUrl ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = [...(e.dataTransfer?.files ?? [])].find((x) =>
                  x.type.startsWith("image/")
                );
                if (f) pickFile(f);
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <span className="text-4xl">🖼️</span>
              <span className="text-sm font-medium text-slate-600">直接 Ctrl + V 貼上截圖</span>
              <span className="text-xs text-slate-400">也可以拖曳圖片進來，或點此選擇檔案</span>
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-slate-200">
              <img src={previewUrl} alt="預覽" className="max-h-52 w-full object-contain bg-slate-50" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200 hover:bg-white"
              >
                換一張
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 解析結果 */}
          {proposals && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500">
                  AI 讀到 {proposals.length} 筆行程
                  {proposals.length > 0 && "（點一下可編輯）"}
                </p>
                <button
                  onClick={addBlankProposal}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
                >
                  ＋ 手動新增
                </button>
              </div>
              {proposals.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  沒讀到行程，換一張更清楚的截圖，或按上方「＋ 手動新增」。
                </p>
              ) : (
                <ul className="space-y-2">
                  {proposals.map((ev, i) => {
                    const editing = editingIdx === i;
                    const inputCls =
                      "w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";
                    return (
                      <li
                        key={i}
                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
                      >
                        {editing ? (
                          <div className="space-y-2">
                            <input
                              className={inputCls}
                              placeholder="標題"
                              value={ev.title}
                              autoFocus
                              onChange={(e) => updateProposal(i, { title: e.target.value })}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="datetime-local"
                                className={inputCls}
                                value={toInputValue(ev.start_time)}
                                onChange={(e) => {
                                  const start = e.target.value;
                                  updateProposal(i, {
                                    start_time: start,
                                    ...(toInputValue(ev.end_time) < start
                                      ? { end_time: start }
                                      : {}),
                                  });
                                }}
                              />
                              <input
                                type="datetime-local"
                                className={inputCls}
                                value={toInputValue(ev.end_time)}
                                min={toInputValue(ev.start_time)}
                                onChange={(e) => updateProposal(i, { end_time: e.target.value })}
                              />
                            </div>
                            <input
                              className={inputCls}
                              placeholder="備註（可留空）"
                              value={ev.description ?? ""}
                              onChange={(e) => updateProposal(i, { description: e.target.value })}
                            />
                            <div className="flex justify-end gap-2 pt-0.5">
                              <button
                                onClick={() => removeProposal(i)}
                                className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                              >
                                刪除
                              </button>
                              <button
                                onClick={() => setEditingIdx(null)}
                                className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700"
                              >
                                完成
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />
                            <button
                              onClick={() => setEditingIdx(i)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {ev.title || "（未命名，點此編輯）"}
                              </p>
                              <p className="text-xs text-slate-400">
                                {formatRange(ev.start_time, ev.end_time)}
                              </p>
                              {ev.description && (
                                <p className="mt-0.5 truncate text-xs text-slate-400">
                                  {ev.description}
                                </p>
                              )}
                            </button>
                            <button
                              onClick={() => setEditingIdx(i)}
                              className="shrink-0 rounded-md px-1.5 text-slate-300 hover:text-indigo-500"
                              title="編輯"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => removeProposal(i)}
                              className="shrink-0 rounded-md px-1.5 text-slate-300 hover:text-red-500"
                              title="移除"
                            >
                              ✕
                            </button>
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

        {/* 底部按鈕 */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          >
            關閉
          </button>
          {!proposals ? (
            <button
              onClick={handleParse}
              disabled={!file || loading}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? "AI 解析中…" : "✨ 開始解析"}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={validCount === 0 || saving}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "加入中…" : `加入 ${validCount} 筆到行事曆`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
