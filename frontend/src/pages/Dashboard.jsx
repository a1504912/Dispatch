import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useNavigate } from "react-router-dom";
import { listEvents } from "../api/events";
import { listPillars } from "../api/pillars";
import { listPosts } from "../api/posts";
import ChatBox from "../components/ChatBox.jsx";
import { platformLabel } from "../lib/content";

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [postEvents, setPostEvents] = useState([]);
  const navigate = useNavigate();

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

    // Scheduled and published posts show up as 30-minute blocks in their pillar color.
    Promise.all([listPosts(), listPillars()])
      .then(([posts, pillars]) => {
        const colors = Object.fromEntries(pillars.map((p) => [p.id, p.color]));
        setPostEvents(
          posts
            .filter((p) => p.status === "scheduled" || p.status === "published")
            .map((p) => ({ ...p, when: p.status === "published" ? p.published_at : p.scheduled_at }))
            .filter((p) => p.when)
            .map((p) => ({
              id: `post-${p.id}`,
              title: `${p.status === "published" ? "✓" : "📅"} [${platformLabel(p.platform)}] ${p.title}`,
              start: p.when,
              end: new Date(new Date(p.when).getTime() + 30 * 60 * 1000),
              color: colors[p.pillar_id] || "#898781",
              extendedProps: { postId: p.id },
            }))
        );
      })
      .catch(() => setPostEvents([]));
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
          events={[...events, ...postEvents]}
          eventClick={({ event }) => {
            if (event.extendedProps.postId) navigate(`/content?post=${event.extendedProps.postId}`);
          }}
        />
      </div>
      <div className="h-[600px] lg:col-span-1">
        <ChatBox />
      </div>
    </div>
  );
}
