import { useEffect, useRef, useState } from "react";
import { createEvent, updateEvent, deleteEvent } from "../api/events";
import { openImage } from "../lightbox";
import { parseImages } from "../images";
import { compressImageFile } from "../imageCompress";
import {
  createSubtask,
  deleteSubtask,
  listSubtasks,
  updateSubtask,
} from "../api/subtasks";

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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 把整項（含時長）移到 targetDate，回傳新的 {start_time, end_time}。 */
function shiftToDate(form, targetDate) {
  if (form.all_day) {
    const spanDays = Math.max(
      0,
      Math.round(
        (new Date(`${form.end_time.slice(0, 10)}T00:00`) -
          new Date(`${form.start_time.slice(0, 10)}T00:00`)) /
          86400000
      )
    );
    return {
      start_time: `${targetDate}T00:00`,
      end_time: `${addDays(targetDate, spanDays)}T00:00`,
    };
  }
  const dur = new Date(form.end_time) - new Date(form.start_time);
  const newStart = `${targetDate}T${form.start_time.slice(11, 16)}`;
  const e = new Date(new Date(newStart).getTime() + dur);
  const newEnd = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}T${pad(
    e.getHours()
  )}:${pad(e.getMinutes())}`;
  return { start_time: newStart, end_time: newEnd };
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
  const taskMode = Boolean(initial?.is_task); // 待辦事項模式：隱藏日期相關欄位
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [newSub, setNewSub] = useState("");
  const [editingSubId, setEditingSubId] = useState(null);
  const [editingSubText, setEditingSubText] = useState("");
  const [dateSubId, setDateSubId] = useState(null);
  // 目前「已選要貼上照片」的明細 id：選了之後直接 Ctrl+V 就會貼進這一項
  const [pasteSubId, setPasteSubId] = useState(null);
  const fileInputRef = useRef(null);
  const isEdit = Boolean(initial?.id);

  async function refreshSubtasks() {
    if (!initial?.id) return;
    try {
      setSubtasks(await listSubtasks(initial.id));
    } catch {
      setSubtasks([]);
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault();
    if (!newSub.trim() || !initial?.id) return;
    await createSubtask(initial.id, newSub.trim());
    setNewSub("");
    refreshSubtasks();
    onSaved?.(); // 讓看板/清單上的明細進度即時更新
  }

  async function handleToggleSubtask(st) {
    await updateSubtask(st.id, { done: !st.done });
    refreshSubtasks();
    onSaved?.();
  }

  function startEditSubtask(st) {
    setEditingSubId(st.id);
    setEditingSubText(st.title);
  }

  async function saveEditSubtask() {
    const id = editingSubId;
    const text = editingSubText.trim();
    setEditingSubId(null);
    if (!id || !text) return;
    await updateSubtask(id, { title: text });
    refreshSubtasks();
    onSaved?.();
  }

  async function handleSubtaskDate(id, dueDate) {
    setDateSubId(null);
    await updateSubtask(id, { due_date: dueDate || null });
    refreshSubtasks();
    onSaved?.();
  }

  async function handleDeleteSubtask(id) {
    await deleteSubtask(id);
    refreshSubtasks();
    onSaved?.();
  }

  // 針對「單一明細」加照片（可一次多張）
  async function handleAddSubtaskImages(st, files) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    const dataUrls = (await Promise.all(list.map((f) => compressImageFile(f)))).filter(Boolean);
    if (!dataUrls.length) return;
    const next = [...parseImages(st), ...dataUrls];
    await updateSubtask(st.id, { images: JSON.stringify(next) });
    refreshSubtasks();
    onSaved?.();
  }

  async function handleRemoveSubtaskImage(st, idx) {
    const next = parseImages(st).filter((_, i) => i !== idx);
    await updateSubtask(st.id, { images: next.length ? JSON.stringify(next) : null });
    refreshSubtasks();
    onSaved?.();
  }

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
      images: parseImages(initial),
      category_id: initial?.category_id != null ? String(initial.category_id) : "",
      is_task: Boolean(initial?.is_task),
    });
    setNewSub("");
    setSubtasks([]);
    setPasteSubId(null);
    if (initial?.id) {
      listSubtasks(initial.id)
        .then(setSubtasks)
        .catch(() => setSubtasks([]));
    }
  }, [open, initial]);

  // 視窗開著時可直接 Ctrl+V 貼圖（capture 讓它優先於總覽頁的貼圖排程）
  // 若已「選定某項明細」（pasteSubId），就貼進那一項；否則貼到主行程圖片。
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/")
      );
      if (!item) return;
      e.stopPropagation();
      const file = item.getAsFile();
      if (pasteSubId != null) {
        const st = subtasks.find((s) => s.id === pasteSubId);
        if (st) {
          handleAddSubtaskImages(st, [file]);
          return;
        }
      }
      readImageFile(file);
    }
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [open, pasteSubId, subtasks]);

  function readImageFile(file) {
    if (!file) return;
    compressImageFile(file).then((dataUrl) => {
      if (dataUrl) setForm((f) => ({ ...f, images: [...(f.images ?? []), dataUrl] }));
    });
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
      image: form.images?.[0] || null, // 第一張給看板縮圖
      images: form.images?.length ? JSON.stringify(form.images) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
      is_task: form.is_task,
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
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-lg font-black text-slate-900">
            {taskMode
              ? isEdit
                ? "編輯待辦"
                : "新增待辦"
              : isEdit
                ? "編輯行程"
                : "新增行程"}
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* 欄位區：超過高度自己捲動 */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-slate-100 px-6 py-4">
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

          {!taskMode && (
          <>
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

          {/* 整項改期：整個主項連同時長一起挪到別天 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-slate-500">整項改期</span>
            {[
              ["今天", todayStr()],
              ["明天", addDays(todayStr(), 1)],
              ["+1週", addDays(form.start_time.slice(0, 10), 7)],
            ].map(([label, target]) => (
              <button
                key={label}
                type="button"
                onClick={() => setForm((f) => ({ ...f, ...shiftToDate(f, target) }))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
              >
                {label}
              </button>
            ))}
            <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600">
              📅 選日期
              <input
                type="date"
                className="sr-only"
                onChange={(e) =>
                  e.target.value && setForm((f) => ({ ...f, ...shiftToDate(f, e.target.value) }))
                }
              />
            </label>
          </div>

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
          </>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">分類</label>
            <select
              className={`${field} cursor-pointer`}
              value={form.category_id}
              onChange={(e) => {
                const id = e.target.value;
                // 選了分類就自動帶入該分類的顏色（之後仍可手動改）
                const cat = categories.find((c) => String(c.id) === id);
                setForm({
                  ...form,
                  category_id: id,
                  color: cat ? cat.color : form.color,
                });
              }}
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
            <label className="mb-1.5 block text-xs font-bold text-slate-500">
              明細
              {subtasks.length > 0 && (
                <span className="ml-2 font-normal text-slate-400">
                  {subtasks.filter((s) => s.done).length}/{subtasks.length} 完成
                </span>
              )}
            </label>
            {!isEdit ? (
              <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-400">
                先儲存行程，就可以新增明細項目。
              </p>
            ) : (
              <div className="space-y-1.5">
                {subtasks.map((st) => {
                  const subImgs = parseImages(st);
                  return (
                  <div
                    key={st.id}
                    className="group rounded-lg border border-slate-200 bg-white"
                  >
                   <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={st.done}
                      onChange={() => handleToggleSubtask(st)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                    />
                    {editingSubId === st.id ? (
                      <input
                        autoFocus
                        value={editingSubText}
                        onChange={(e) => setEditingSubText(e.target.value)}
                        onBlur={saveEditSubtask}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEditSubtask();
                          } else if (e.key === "Escape") {
                            setEditingSubId(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditSubtask(st)}
                        title="點一下編輯"
                        className={`min-w-0 flex-1 break-words text-left text-sm ${
                          st.done ? "text-slate-400 line-through" : "text-slate-700"
                        }`}
                      >
                        {st.title}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPasteSubId((id) => (id === st.id ? null : st.id))}
                      title={
                        pasteSubId === st.id
                          ? "已選這項，直接按 Ctrl+V 貼上照片"
                          : "選這項，然後按 Ctrl+V 貼上照片"
                      }
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium transition ${
                        pasteSubId === st.id
                          ? "bg-sky-500 text-white ring-2 ring-sky-200"
                          : subImgs.length > 0
                            ? "bg-sky-50 text-sky-600 hover:bg-sky-100"
                            : "text-slate-300 hover:text-sky-500 group-hover:text-slate-400"
                      }`}
                    >
                      📷{subImgs.length > 0 ? subImgs.length : ""}
                    </button>
                    {dateSubId === st.id ? (
                      <input
                        type="date"
                        autoFocus
                        defaultValue={st.due_date || ""}
                        onBlur={(e) => handleSubtaskDate(st.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSubtaskDate(st.id, e.target.value);
                          if (e.key === "Escape") setDateSubId(null);
                        }}
                        className="shrink-0 rounded-md border border-indigo-300 bg-white px-1.5 py-1 text-xs outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDateSubId(st.id)}
                        title={st.due_date ? `延到 ${st.due_date}（點此改）` : "設定日期"}
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium transition ${
                          st.due_date
                            ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                            : "text-slate-300 hover:text-indigo-500 group-hover:text-slate-400"
                        }`}
                      >
                        {st.due_date
                          ? `📅 ${Number(st.due_date.slice(5, 7))}/${Number(st.due_date.slice(8, 10))}`
                          : "📅"}
                      </button>
                    )}
                    {st.due_date && dateSubId !== st.id && (
                      <button
                        type="button"
                        onClick={() => handleSubtaskDate(st.id, "")}
                        title="取消日期"
                        className="shrink-0 rounded-md px-0.5 text-[10px] text-slate-300 hover:text-red-500"
                      >
                        清
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteSubtask(st.id)}
                      className="shrink-0 rounded-md px-1 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                      title="刪除明細"
                    >
                      ✕
                    </button>
                   </div>
                   {pasteSubId === st.id && (
                     <p className="px-3 pb-1.5 pl-9 text-[11px] font-medium text-sky-600">
                       📋 已選這項 —— 直接按 Ctrl+V 貼上截圖（可連續貼多張）；再按一次 📷 取消。
                     </p>
                   )}
                   {subImgs.length > 0 && (
                     <div className="flex flex-wrap gap-1.5 px-3 pb-2 pl-9">
                       {subImgs.map((src, i) => (
                         <div key={i} className="relative">
                           <img
                             src={src}
                             alt=""
                             onClick={() => openImage(src)}
                             className="h-12 w-12 cursor-zoom-in rounded-md object-cover ring-1 ring-slate-200"
                           />
                           <button
                             type="button"
                             onClick={() => handleRemoveSubtaskImage(st, i)}
                             className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] text-white shadow hover:bg-red-500"
                             title="移除這張"
                           >
                             ✕
                           </button>
                         </div>
                       ))}
                     </div>
                   )}
                  </div>
                  );
                })}
                <div className="flex gap-1.5">
                  <input
                    className={`${field} flex-1`}
                    placeholder="新增明細，例：轉週報表跳錯"
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubtask(e);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtask}
                    disabled={!newSub.trim()}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-indigo-600 shadow-sm transition hover:bg-indigo-50 active:scale-95 disabled:opacity-40"
                  >
                    ＋
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">
              圖片
              {form.images?.length > 0 && (
                <span className="ml-2 font-normal text-slate-400">{form.images.length} 張</span>
              )}
            </label>
            {form.images?.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {form.images.map((img, idx) => (
                  <div
                    key={idx}
                    className="group relative overflow-hidden rounded-lg border border-slate-200"
                  >
                    <img
                      src={img}
                      alt=""
                      onClick={() => openImage(img)}
                      className="h-20 w-full cursor-zoom-in bg-slate-50 object-cover"
                      title="點擊放大"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))
                      }
                      className="absolute right-1 top-1 rounded-md bg-white/90 px-1.5 text-xs font-bold text-red-600 opacity-0 shadow transition group-hover:opacity-100"
                      title="移除這張"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-3 text-xs text-slate-400 transition hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              📷 直接 Ctrl + V 貼上，或點此新增圖片（可放多張）
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                [...(e.target.files ?? [])].forEach(readImageFile);
                e.target.value = "";
              }}
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

          </div>

          {/* 按鈕列：固定在視窗底部，永遠看得到 */}
          <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-4">
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
