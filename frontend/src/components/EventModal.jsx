import { useEffect, useRef, useState } from "react";
import { createEvent, updateEvent, deleteEvent } from "../api/events";

// 可選的事件顏色
const COLORS = [
  "#6366f1", // 靛
  "#8b5cf6", // 紫
  "#0ea5e9", // 天藍
  "#10b981", // 綠
  "#f59e0b", // 琥珀
  "#f43f5e", // 玫瑰
  "#64748b", // 灰
];

const pad = (n) => String(n).padStart(2, "0");

/** Date 或 ISO 字串 → datetime-local 需要的 "YYYY-MM-DDTHH:MM"（本地時間）。 */
function toInputValue(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** 取得「下一個整點」與其後一小時，當作新增時的預設。 */
function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start, end };
}

/** "YYYY-MM-DD" 加 n 天。 */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MINUTE_OPTIONS = ["00", "15", "30", "45"];

/** 日期 + 上午/下午 + 時 + 分 的組合選擇器（value 為 "YYYY-MM-DDTHH:MM"）。 */
function DateTimeField({ value, onChange, fieldClass }) {
  const date = value.slice(0, 10);
  const hh = parseInt(value.slice(11, 13) || "0", 10);
  const mm = value.slice(14, 16) || "00";
  const isPM = hh >= 12;
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  const minutes = MINUTE_OPTIONS.includes(mm) ? MINUTE_OPTIONS : [mm, ...MINUTE_OPTIONS];

  function emit(nextDate, nextPM, nextH12, nextMM) {
    let h = nextH12 % 12;
    if (nextPM) h += 12;
    onChange(`${nextDate}T${pad(h)}:${nextMM}`);
  }

  const selectCls =
    "shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-1.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="flex gap-1.5">
      <input
        type="date"
        className={`${fieldClass} min-w-0 flex-1`}
        value={date}
        onChange={(e) => emit(e.target.value, isPM, hour12, mm)}
      />
      <select
        className={selectCls}
        value={isPM ? "pm" : "am"}
        onChange={(e) => emit(date, e.target.value === "pm", hour12, mm)}
      >
        <option value="am">上午</option>
        <option value="pm">下午</option>
      </select>
      <select
        className={selectCls}
        value={hour12}
        onChange={(e) => emit(date, isPM, Number(e.target.value), mm)}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h} 時
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={mm}
        onChange={(e) => emit(date, isPM, hour12, e.target.value)}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m} 分
          </option>
        ))}
      </select>
    </div>
  );
}

export default function EventModal({ open, onClose, onSaved, initial, agents = [], categories = [] }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    const fallback = defaultTimes();
    setForm({
      title: initial?.title ?? "",
      start_time: toInputValue(initial?.start_time ?? fallback.start),
      end_time: toInputValue(initial?.end_time ?? fallback.end),
      agent_id: initial?.agent_id != null ? String(initial.agent_id) : "",
      color: initial?.color ?? COLORS[0],
      description: initial?.description ?? "",
      completed: initial?.completed ?? false,
      all_day: initial?.all_day ?? false,
      image: initial?.image ?? "",
      category_id: initial?.category_id != null ? String(initial.category_id) : "",
    });
  }, [open, initial]);

  // 視窗開著時可直接 Ctrl+V 貼圖（capture 讓它優先於總覽頁的貼圖排程）
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/")
      );
      if (!item) return;
      e.stopPropagation();
      readImageFile(item.getAsFile());
    }
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [open]);

  function readImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result }));
    reader.readAsDataURL(file);
  }

  if (!open || !form) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    if (!form.all_day && form.end_time < form.start_time) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      description: form.description,
      color: form.color,
      agent_id: form.agent_id ? Number(form.agent_id) : null,
      completed: form.completed,
      all_day: form.all_day,
      image: form.image || null,
      category_id: form.category_id ? Number(form.category_id) : null,
    };
    try {
      if (isEdit) await updateEvent(initial.id, payload);
      else await createEvent(payload);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`確定要刪除「${form.title}」這個行程嗎？`)) return;
    setSaving(true);
    try {
      await deleteEvent(initial.id);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">
            {isEdit ? "編輯行程" : "新增行程"}
          </h2>
          <button
            type="button"
            onClick={() => setForm({ ...form, completed: !form.completed })}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition active:scale-95 ${
              form.completed
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-slate-50 text-slate-400 ring-slate-200 hover:text-slate-600"
            }`}
          >
            {form.completed ? "✅ 已完成" : "⬜ 未完成"}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">標題 *</label>
            <input
              autoFocus
              className={field}
              placeholder="例：和客戶開會"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => {
                const allDay = e.target.checked;
                const startDate = form.start_time.slice(0, 10);
                if (allDay) {
                  // 轉整天：起 = 當天 00:00，迄 = 隔天 00:00（不含）
                  setForm({
                    ...form,
                    all_day: true,
                    start_time: `${startDate}T00:00`,
                    end_time: `${addDays(startDate, 1)}T00:00`,
                  });
                } else {
                  setForm({
                    ...form,
                    all_day: false,
                    start_time: `${startDate}T09:00`,
                    end_time: `${startDate}T10:00`,
                  });
                }
              }}
              className="h-4 w-4 accent-indigo-600"
            />
            整天
          </label>

          {form.all_day ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">開始日期</label>
                <input
                  type="date"
                  className={field}
                  value={form.start_time.slice(0, 10)}
                  onChange={(e) => {
                    const d = e.target.value;
                    const endDisplay = addDays(form.end_time.slice(0, 10), -1);
                    setForm({
                      ...form,
                      start_time: `${d}T00:00`,
                      end_time: `${addDays(endDisplay < d ? d : endDisplay, 1)}T00:00`,
                    });
                  }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  結束日期（含當天）
                </label>
                <input
                  type="date"
                  className={field}
                  value={addDays(form.end_time.slice(0, 10), -1)}
                  min={form.start_time.slice(0, 10)}
                  onChange={(e) =>
                    setForm({ ...form, end_time: `${addDays(e.target.value, 1)}T00:00` })
                  }
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">開始</label>
                <DateTimeField
                  fieldClass={field}
                  value={form.start_time}
                  onChange={(start) =>
                    // 開始往後移時，若超過結束就把結束一起順移
                    setForm((f) => ({
                      ...f,
                      start_time: start,
                      end_time: f.end_time < start ? start : f.end_time,
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">結束</label>
                <DateTimeField
                  fieldClass={field}
                  value={form.end_time}
                  onChange={(end) => setForm({ ...form, end_time: end })}
                />
              </div>
            </div>
          )}
          {!form.all_day && form.end_time < form.start_time && (
            <p className="text-xs text-red-500">⚠️ 結束時間早於開始時間</p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">分類</label>
            <select
              className={`${field} cursor-pointer`}
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">負責員工</label>
            <select
              className={`${field} cursor-pointer`}
              value={form.agent_id}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
            >
              <option value="">未指派</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">顏色</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full transition ${
                    form.color === c ? "ring-2 ring-slate-800 ring-offset-2" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">圖片</label>
            {form.image ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200">
                <img
                  src={form.image}
                  alt=""
                  className="max-h-44 w-full bg-slate-50 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, image: "" })}
                  className="absolute right-2 top-2 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-red-600 shadow ring-1 ring-slate-200 hover:bg-white"
                >
                  移除
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-4 text-xs text-slate-400 transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                📷 直接 Ctrl + V 貼上圖片，或點此選擇檔案
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => readImageFile(e.target.files?.[0])}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">備註</label>
            <textarea
              className={field}
              rows={2}
              placeholder="補充說明（可留空）"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="mr-auto rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
              >
                刪除
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!form.title.trim() || saving}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "儲存中…" : isEdit ? "儲存變更" : "新增"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
