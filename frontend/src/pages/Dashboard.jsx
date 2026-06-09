import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { listEvents } from "../api/events";
import ChatBox from "../components/ChatBox.jsx";

export default function Dashboard() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    listEvents()
      .then((data) =>
        setEvents(
          data.map((e) => ({
            id: String(e.id),
            title: e.title,
            start: e.start_time,
            end: e.end_time,
            color: e.color,
          }))
        )
      )
      .catch(() => setEvents([]));
  }, []);

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-lg border bg-white p-4 lg:col-span-2">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          height="auto"
          events={events}
        />
      </div>
      <div className="h-[600px] lg:col-span-1">
        <ChatBox />
      </div>
    </div>
  );
}
