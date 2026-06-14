import { useState } from "react";

const RANGE_LABEL = {
  dayGridMonth: "當月",
  timeGridWeek: "當週",
  timeGridDay: "當日",
};

function formatWhen(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const date = s.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
  const t = (d) => d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}　${t(s)}–${t(e)}`;
}

export default function EventList({ events, agents = [], type, onToggle, onEdit }) {
  const [sort, setSort] = useState("time"); // time | status
  const agentName = (id) => agents.find((a) => a.id === id)?.name;

  const sorted = [...events].sort((a, b) => {
    if (sort === "status" && Boolean(a.completed) !== Boolean(b.completed)) {
      return a.completed ? 1 : -1; // 未完成在前
    }
    return new Date(a.start_time) - new Date(b.start_time);
  });

  const doneCount = events.filter((e) => e.completed).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">
            行程清單
            <span className="ml-2 text-sm font-medium text-slate-400">
              {RANGE_LABEL[type] ?? ""}共 {events.length} 件
              {events.length > 0 && `・完成 ${doneCount}`}
            </span>
          </h2>
        </div>

        {/* 排序切換 */}
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            onClick={() => setSort("time")}
            className={`rounded-lg px-3 py-1.5 transition ${
              sort === "time" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            依時間
          </button>
          <button
            onClick={() => setSort("status")}
            className={`rounded-lg px-3 py-1.5 transition ${
              sort === "status" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            未完成優先
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">這段期間沒有行程。</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {sorted.map((ev) => (
            <li
              key={ev.id}
              className="group flex cursor-pointer items-center gap-3 py-3 transition hover:bg-slate-50"
              onClick={() => onEdit(ev)}
            >
              <input
                type="checkbox"
                checked={Boolean(ev.completed)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggle(ev.id, !ev.completed)}
                className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: ev.color }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-semibold ${
                    ev.completed ? "text-slate-400 line-through" : "text-slate-800"
                  }`}
                >
                  {ev.title}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {formatWhen(ev.start_time, ev.end_time)}
                  {agentName(ev.agent_id) && `　·　${agentName(ev.agent_id)}`}
                </p>
              </div>
              {ev.completed ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200">
                  已完成
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-200">
                  未完成
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
