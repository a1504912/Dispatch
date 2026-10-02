import { useState } from "react";

const RANGE_LABEL = {
  dayGridMonth: "當月",
  timeGridWeek: "當週",
  timeGridDay: "當日",
};

function formatWhen(ev) {
  const s = new Date(ev.start_time);
  const e = new Date(ev.end_time);
  const day = (d) =>
    d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
  if (ev.all_day) {
    // end_time 是「不含」的隔天，顯示時往回一天
    const lastDay = new Date(e);
    lastDay.setDate(lastDay.getDate() - 1);
    const range =
      lastDay > s ? `${day(s)} – ${day(lastDay)}` : day(s);
    return `${range}　整天`;
  }
  const t = (d) => d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day(s)}　${t(s)}–${t(e)}`;
}

export default function EventList({
  events,
  agents = [],
  subtaskCounts = {},
  type,
  onToggle,
  onEdit,
}) {
  const [sort, setSort] = useState("time"); // time | status
  const [filter, setFilter] = useState("all"); // all | active | done
  // 收合狀態（記住使用者偏好）
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("dispatch.eventListCollapsed") === "1"
  );
  const agentName = (id) => agents.find((a) => a.id === id)?.name;

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("dispatch.eventListCollapsed", c ? "0" : "1");
      return !c;
    });
  }

  const filtered = events.filter((e) => {
    if (filter === "active") return !e.completed;
    if (filter === "done") return e.completed;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "status" && Boolean(a.completed) !== Boolean(b.completed)) {
      return a.completed ? 1 : -1; // 未完成在前
    }
    return new Date(a.start_time) - new Date(b.start_time);
  });

  const doneCount = events.filter((e) => e.completed).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={toggleCollapsed}
          className="group flex items-center gap-2"
          title={collapsed ? "展開清單" : "收合清單"}
        >
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform group-hover:text-slate-600 ${
              collapsed ? "-rotate-90" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
          <h2 className="text-lg font-black text-slate-900">
            行程清單
            <span className="ml-2 text-sm font-medium text-slate-400">
              {RANGE_LABEL[type] ?? ""}共 {events.length} 件
              {events.length > 0 && `・完成 ${doneCount}`}
            </span>
          </h2>
        </button>

        <div className={`flex-wrap items-center gap-2 ${collapsed ? "hidden" : "flex"}`}>
        {/* 篩選 */}
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          {[
            ["all", "全部"],
            ["active", "未完成"],
            ["done", "已完成"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 transition ${
                filter === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
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
      </div>

      {collapsed ? null : sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {filter === "all" ? "這段期間沒有行程。" : "沒有符合篩選的行程。"}
        </p>
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
                  {formatWhen(ev)}
                  {agentName(ev.agent_id) && `　·　${agentName(ev.agent_id)}`}
                  {subtaskCounts[ev.id] && (
                    <span
                      className={`ml-1.5 ${
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
