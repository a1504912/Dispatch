import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import zhTwLocale from "@fullcalendar/core/locales/zh-tw";
import { listEvents, setEventCompleted } from "../api/events";
import { listAgents } from "../api/agents";
import { listCategories } from "../api/categories";
import { listSubtasks, updateSubtask } from "../api/subtasks";
import { NO_BACKEND } from "../localMode";
import ChatBox from "../components/ChatBox.jsx";
import ImageScheduleModal from "../components/ImageScheduleModal.jsx";
import EventModal from "../components/EventModal.jsx";
import EventList from "../components/EventList.jsx";
import GoogleSync from "../components/GoogleSync.jsx";
import WeekBoard from "../components/WeekBoard.jsx";

function StatCard({ emoji, label, value, hint }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-xl ring-1 ring-indigo-100">
        {emoji}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="text-xl font-black text-slate-800">
          {value}
          {hint && <span className="ml-1 text-xs font-medium text-slate-400">{hint}</span>}
        </p>
      </div>
    </div>
  );
}

function CategoryFilterDropdown({ categories, catFilter, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const label =
    catFilter.length === 0 ? "分類：全部" : `分類：已選 ${catFilter.length} 項`;

  const row = (active) =>
    `flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
      active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium shadow-sm transition active:scale-95 ${
          catFilter.length > 0
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        🏷️ {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <button className={row(catFilter.length === 0)} onClick={onClear}>
            全部
            {catFilter.length === 0 && <span className="ml-auto">✓</span>}
          </button>
          <div className="my-1 border-t border-slate-100" />
          {categories.map((c) => {
            const key = String(c.id);
            const active = catFilter.includes(key);
            return (
              <button key={c.id} className={row(active)} onClick={() => onToggle(key)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
                {active && <span className="ml-auto">✓</span>}
              </button>
            );
          })}
          <button className={row(catFilter.includes("none"))} onClick={() => onToggle("none")}>
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            未分類
            {catFilter.includes("none") && <span className="ml-auto">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [rawEvents, setRawEvents] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  // 篩選：選中的分類 id（空陣列 = 全部；"none" 代表未分類）、是否顯示 Google 事件
  const [catFilter, setCatFilter] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dispatch.catFilter")) || [];
    } catch {
      return [];
    }
  });
  const [showGoogle, setShowGoogle] = useState(
    () => localStorage.getItem("dispatch.showGoogle") !== "0"
  );

  function toggleCatFilter(key) {
    setCatFilter((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem("dispatch.catFilter", JSON.stringify(next));
      return next;
    });
  }

  function toggleShowGoogle() {
    setShowGoogle((v) => {
      localStorage.setItem("dispatch.showGoogle", v ? "0" : "1");
      return !v;
    });
  }
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [pastedFile, setPastedFile] = useState(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  // 行事曆目前檢視範圍（月/週/日），清單依此過濾
  const [viewRange, setViewRange] = useState(null);
  // 檢視模式：行事曆 / 週看板（記住偏好）
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("dispatch.viewMode") || "calendar"
  );

  function switchMode(mode) {
    setViewMode(mode);
    localStorage.setItem("dispatch.viewMode", mode);
  }

  function openNewEvent(initial = null) {
    setEditingEvent(initial);
    setEventModalOpen(true);
  }

  // 在總覽頁任何地方 Ctrl+V 貼圖，直接開啟截圖排程（離線模式無 AI，停用）
  useEffect(() => {
    if (NO_BACKEND) return;
    function onPaste(e) {
      if (imageModalOpen || eventModalOpen) return; // 視窗開著時交給視窗自己處理
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/")
      );
      if (item) {
        setPastedFile(item.getAsFile());
        setImageModalOpen(true);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [imageModalOpen, eventModalOpen]);

  const [subtasks, setSubtasks] = useState([]);

  function loadEvents() {
    listSubtasks()
      .then(setSubtasks)
      .catch(() => setSubtasks([]));
    return listEvents()
      .then(setRawEvents)
      .catch(() => setRawEvents([]));
  }

  // 每個行程的明細進度 {event_id: {done, total}} 與分組明細
  const subtaskCounts = {};
  const subtasksByEvent = {};
  for (const st of subtasks) {
    const c = (subtaskCounts[st.event_id] ??= { done: 0, total: 0 });
    c.total += 1;
    if (st.done) c.done += 1;
    (subtasksByEvent[st.event_id] ??= []).push(st);
  }

  // 看板上直接打勾明細
  async function toggleSubtask(st) {
    await updateSubtask(st.id, { done: !st.done });
    loadEvents();
  }

  // 點行事曆上的事件 → 開啟編輯
  function handleEventClick(info) {
    const raw = rawEvents.find((e) => String(e.id) === info.event.id);
    if (raw) openNewEvent(raw);
  }

  // 拖選一段空白時段 → 用該時間預填新增
  function handleSelect(info) {
    openNewEvent({ start_time: info.start, end_time: info.end, all_day: info.allDay });
  }

  // 行事曆上直接勾選完成/未完成
  async function toggleCompleted(id, completed) {
    await setEventCompleted(Number(id), completed);
    loadEvents();
  }

  useEffect(() => {
    loadEvents();
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // 套用篩選後的原始事件
  const visibleRaw = rawEvents.filter((e) => {
    if (!showGoogle && e.source === "google") return false;
    if (catFilter.length > 0) {
      const key = e.category_id != null ? String(e.category_id) : "none";
      if (!catFilter.includes(key)) return false;
    }
    return true;
  });

  // FullCalendar 用的格式
  const events = visibleRaw.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    color: e.color,
    allDay: Boolean(e.all_day),
    completed: e.completed,
    classNames: e.completed ? ["event-done"] : [],
  }));

  // 落在目前檢視範圍內的事項（給下方清單用）
  const rangedEvents = viewRange
    ? visibleRaw.filter((e) => {
        const d = new Date(e.start_time);
        return d >= viewRange.start && d < viewRange.end;
      })
    : visibleRaw;

  const today = new Date();
  const todayEvents = events.filter((e) => {
    const d = new Date(e.start);
    return d.toDateString() === today.toDateString();
  });
  const todayDone = todayEvents.filter((e) => e.completed).length;
  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">總覽</h1>
          <p className="mt-1 text-sm text-slate-500">
            {today.toLocaleDateString("zh-TW", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
            ，把今天交給你的團隊吧。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!NO_BACKEND && <GoogleSync onSynced={loadEvents} />}
          <button
            onClick={() => openNewEvent()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
          >
            ＋ 新增行程
          </button>
          {!NO_BACKEND && (
            <button
              onClick={() => setImageModalOpen(true)}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95"
            >
              📷 截圖排程
            </button>
          )}
        </div>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {!NO_BACKEND && <StatCard emoji="🧑‍💻" label="AI 員工" value={agents.length} hint="位" />}
        {!NO_BACKEND && <StatCard emoji="⚡" label="工作中" value={activeCount} hint="位" />}
        <StatCard
          emoji="📌"
          label="今日行程"
          value={todayEvents.length === 0 ? 0 : `${todayDone}/${todayEvents.length}`}
          hint={todayEvents.length === 0 ? "件" : "件完成"}
        />
      </div>

      {/* 行事曆 + 清單 + 對話 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className={`space-y-6 ${NO_BACKEND ? "xl:col-span-3" : "xl:col-span-2"}`}>
        {/* 檢視切換 + 篩選 */}
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-fit rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            onClick={() => switchMode("calendar")}
            className={`rounded-lg px-4 py-1.5 transition ${
              viewMode === "calendar"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            🗓 行事曆
          </button>
          <button
            onClick={() => switchMode("board")}
            className={`rounded-lg px-4 py-1.5 transition ${
              viewMode === "board"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            📋 週看板
          </button>
        </div>

        {/* 分類篩選（下拉收合） */}
        {categories.length > 0 && (
          <CategoryFilterDropdown
            categories={categories}
            catFilter={catFilter}
            onToggle={toggleCatFilter}
            onClear={() => {
              setCatFilter([]);
              localStorage.setItem("dispatch.catFilter", "[]");
            }}
          />
        )}

        {/* Google 事件開關 */}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showGoogle}
            onChange={toggleShowGoogle}
            className="h-4 w-4 accent-indigo-600"
          />
          顯示 Google 事件
        </label>
        </div>

        {viewMode === "board" ? (
          <WeekBoard
            events={visibleRaw}
            subtasksByEvent={subtasksByEvent}
            onToggleSubtask={toggleSubtask}
            onToggle={toggleCompleted}
            onEdit={openNewEvent}
            onAdd={(d) => {
              const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
                d.getDate()
              ).padStart(2, "0")}`;
              openNewEvent({
                start_time: `${day}T09:00`,
                end_time: `${day}T10:00`,
              });
            }}
          />
        ) : (
          <>
        {/* 行程清單（跟著行事曆檢視範圍） */}
        <EventList
          events={rangedEvents}
          agents={agents}
          subtaskCounts={subtaskCounts}
          type={viewRange?.type}
          onToggle={toggleCompleted}
          onEdit={openNewEvent}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={zhTwLocale}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            height={620}
            nowIndicator
            eventDisplay="block"
            dayMaxEventRows={4}
            scrollTime="08:00:00"
            datesSet={(arg) =>
              setViewRange({
                start: arg.view.currentStart,
                end: arg.view.currentEnd,
                type: arg.view.type,
              })
            }
            selectable
            selectMirror
            events={events}
            eventClick={handleEventClick}
            select={handleSelect}
            eventContent={(arg) => {
              const completed = arg.event.extendedProps.completed;
              const checkbox = (
                <input
                  type="checkbox"
                  checked={Boolean(completed)}
                  onChange={() => {}}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCompleted(arg.event.id, !completed);
                  }}
                  className="h-3 w-3 shrink-0 cursor-pointer accent-emerald-500"
                  title={completed ? "標記為未完成" : "標記為完成"}
                />
              );

              // 週/日檢視的直式方塊：時間一行、標題換行顯示
              const isTimeBlock =
                arg.view.type.startsWith("timeGrid") && !arg.event.allDay;
              if (isTimeBlock) {
                return (
                  <div className="flex h-full flex-col gap-0.5 overflow-hidden px-1 py-0.5">
                    <div className="flex items-center gap-1">
                      {checkbox}
                      {arg.timeText && (
                        <span className="truncate text-[10px] leading-none opacity-80">
                          {arg.timeText}
                        </span>
                      )}
                    </div>
                    <span
                      className={`break-words text-xs font-medium leading-tight ${
                        completed ? "line-through opacity-70" : ""
                      }`}
                    >
                      {arg.event.title}
                    </span>
                  </div>
                );
              }

              // 月檢視、整天列：單行精簡
              return (
                <div className="flex items-center gap-1 overflow-hidden px-0.5">
                  {checkbox}
                  {arg.timeText && (
                    <span className="shrink-0 text-[10px] opacity-80">{arg.timeText}</span>
                  )}
                  <span className={`truncate ${completed ? "line-through opacity-70" : ""}`}>
                    {arg.event.title}
                  </span>
                </div>
              );
            }}
          />
        </div>
          </>
        )}
        </div>

        {!NO_BACKEND && (
          <div className="h-[640px] xl:col-span-1 xl:h-auto">
            <ChatBox agents={agents} />
          </div>
        )}
      </div>

      <ImageScheduleModal
        open={imageModalOpen}
        initialFile={pastedFile}
        onClose={() => {
          setImageModalOpen(false);
          setPastedFile(null);
        }}
        onSaved={loadEvents}
      />

      <EventModal
        open={eventModalOpen}
        initial={editingEvent}
        agents={agents}
        categories={categories}
        onClose={() => {
          setEventModalOpen(false);
          setEditingEvent(null);
        }}
        onSaved={loadEvents}
      />
    </div>
  );
}
