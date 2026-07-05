import { useState } from "react";

function startOfWeek(base) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // 週日開始
  return d;
}

const fmtDay = (d) =>
  `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleDateString("zh-TW", { weekday: "short" })}`;
const fmtTime = (x) =>
  new Date(x).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function WeekBoard({ events, subtaskCounts = {}, onToggle, onEdit, onAdd }) {
  const [offset, setOffset] = useState(0);

  const weekStart = startOfWeek(new Date());
  weekStart.setDate(weekStart.getDate() + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const isToday = (d) => d.toDateString() === new Date().toDateString();

  function eventsOf(d) {
    return events
      .filter((e) => new Date(e.start_time).toDateString() === d.toDateString())
      .sort(
        (a, b) =>
          Number(b.all_day) - Number(a.all_day) ||
          new Date(a.start_time) - new Date(b.start_time)
      );
  }

  const navBtn =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* 標頭 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-900">
          週看板
          <span className="ml-2 text-sm font-medium text-slate-400">
            {fmtDay(days[0])} – {fmtDay(days[6])}
          </span>
        </h2>
        <div className="flex gap-1.5">
          <button className={navBtn} onClick={() => setOffset((o) => o - 1)}>
            ‹
          </button>
          <button className={navBtn} onClick={() => setOffset(0)}>
            本週
          </button>
          <button className={navBtn} onClick={() => setOffset((o) => o + 1)}>
            ›
          </button>
        </div>
      </div>

      {/* 一天一欄，七欄平均分配填滿寬度 */}
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const list = eventsOf(d);
          return (
            <div
              key={d.toISOString()}
              className={`min-w-0 rounded-xl p-1.5 ${
                isToday(d) ? "bg-indigo-50/70 ring-1 ring-indigo-200" : "bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between pb-1.5 pl-1">
                <span
                  className={`truncate text-xs font-bold ${
                    isToday(d) ? "text-indigo-700" : "text-slate-600"
                  }`}
                >
                  {fmtDay(d)}
                </span>
                <button
                  onClick={() => onAdd(d)}
                  className="shrink-0 rounded-md px-1 text-slate-400 transition hover:bg-white hover:text-indigo-600"
                  title="在這天新增行程"
                >
                  ＋
                </button>
              </div>

              <div className="space-y-1.5">
                {list.length === 0 && (
                  <p className="py-3 text-center text-xs text-slate-300">－</p>
                )}
                {list.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onEdit(ev)}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                    style={{ borderLeft: `3px solid ${ev.color}` }}
                  >
                    <div className="flex items-start gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(ev.completed)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggle(ev.id, !ev.completed)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`break-words text-xs font-medium leading-snug ${
                            ev.completed ? "text-slate-400 line-through" : "text-slate-800"
                          }`}
                        >
                          {ev.title}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {ev.all_day ? "整天" : `${fmtTime(ev.start_time)}–${fmtTime(ev.end_time)}`}
                          {subtaskCounts[ev.id] && (
                            <span
                              className={`ml-1 ${
                                subtaskCounts[ev.id].done === subtaskCounts[ev.id].total
                                  ? "text-emerald-500"
                                  : "text-indigo-500"
                              }`}
                            >
                              ☑ {subtaskCounts[ev.id].done}/{subtaskCounts[ev.id].total}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    {ev.image && (
                      <img
                        src={ev.image}
                        alt=""
                        className="mt-1 w-full rounded-md border border-slate-100 object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
