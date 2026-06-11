import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import zhTwLocale from "@fullcalendar/core/locales/zh-tw";
import { listEvents } from "../api/events";
import { listAgents } from "../api/agents";
import ChatBox from "../components/ChatBox.jsx";
import ImageScheduleModal from "../components/ImageScheduleModal.jsx";
import EventModal from "../components/EventModal.jsx";

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

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [rawEvents, setRawEvents] = useState([]);
  const [agents, setAgents] = useState([]);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [pastedFile, setPastedFile] = useState(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  function openNewEvent(initial = null) {
    setEditingEvent(initial);
    setEventModalOpen(true);
  }

  // 在總覽頁任何地方 Ctrl+V 貼圖，直接開啟截圖排程
  useEffect(() => {
    function onPaste(e) {
      if (imageModalOpen) return; // 視窗開著時交給視窗自己處理
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
  }, [imageModalOpen]);

  function loadEvents() {
    return listEvents()
      .then((data) => {
        setRawEvents(data);
        setEvents(
          data.map((e) => ({
            id: String(e.id),
            title: e.title,
            start: e.start_time,
            end: e.end_time,
            color: e.color,
          }))
        );
      })
      .catch(() => {
        setRawEvents([]);
        setEvents([]);
      });
  }

  // 點行事曆上的事件 → 開啟編輯
  function handleEventClick(info) {
    const raw = rawEvents.find((e) => String(e.id) === info.event.id);
    if (raw) openNewEvent(raw);
  }

  // 拖選一段空白時段 → 用該時間預填新增
  function handleSelect(info) {
    openNewEvent({ start_time: info.start, end_time: info.end });
  }

  useEffect(() => {
    loadEvents();
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  const today = new Date();
  const todayCount = events.filter((e) => {
    const d = new Date(e.start);
    return d.toDateString() === today.toDateString();
  }).length;
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
        <div className="flex gap-2">
          <button
            onClick={() => openNewEvent()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
          >
            ＋ 新增行程
          </button>
          <button
            onClick={() => setImageModalOpen(true)}
            className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95"
          >
            📷 截圖排程
          </button>
        </div>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard emoji="🧑‍💻" label="AI 員工" value={agents.length} hint="位" />
        <StatCard emoji="⚡" label="工作中" value={activeCount} hint="位" />
        <StatCard emoji="📌" label="今日行程" value={todayCount} hint="件" />
      </div>

      {/* 行事曆 + 對話 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
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
            scrollTime="08:00:00"
            selectable
            selectMirror
            events={events}
            eventClick={handleEventClick}
            select={handleSelect}
          />
        </div>
        <div className="h-[640px] xl:col-span-1 xl:h-auto">
          <ChatBox agents={agents} />
        </div>
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
        onClose={() => {
          setEventModalOpen(false);
          setEditingEvent(null);
        }}
        onSaved={loadEvents}
      />
    </div>
  );
}
