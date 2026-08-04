import { useState } from "react";
import { TW_CITIES, weatherIcon } from "../api/weather";
import { openImage } from "../lightbox";

function startOfWeek(base) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // 週日開始
  return d;
}

const pad = (n) => String(n).padStart(2, "0");
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = (d) =>
  `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleDateString("zh-TW", { weekday: "short" })}`;
const fmtTime = (x) =>
  new Date(x).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function WeekBoard({
  events,
  subtasksByEvent = {},
  weather = {},
  hourly = {},
  weatherLoc,
  onChangeCity,
  onToggleSubtask,
  onToggle,
  onEdit,
  onAdd,
}) {
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set()); // 展開明細，key = `${eventId}:${dayStr}`
  const [weatherDay, setWeatherDay] = useState(null); // 點開逐時天氣的日期字串

  function toggleExpanded(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const weekStart = startOfWeek(new Date());
  weekStart.setDate(weekStart.getDate() + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const isToday = (d) => d.toDateString() === new Date().toDateString();

  const sortedEvents = [...events].sort(
    (a, b) =>
      Number(b.all_day) - Number(a.all_day) || new Date(a.start_time) - new Date(b.start_time)
  );

  // 某一天要顯示的卡片：主項卡（該天的行程）+ 分身卡（明細被延到該天）
  function cardsOf(day) {
    const ds = dateStr(day);
    const cards = [];
    for (const ev of sortedEvents) {
      const evStr = dateStr(new Date(ev.start_time));
      const subs = subtasksByEvent[ev.id] ?? [];
      const subsForDay = subs.filter((s) => (s.due_date || evStr) === ds);
      if (evStr === ds) {
        cards.push({ ev, subs: subsForDay, spillover: false });
      } else if (subsForDay.length > 0) {
        cards.push({ ev, subs: subsForDay, spillover: true });
      }
    }
    return cards;
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
        <div className="flex items-center gap-1.5">
          {onChangeCity && (
            <select
              value={weatherLoc?.label ?? ""}
              onChange={(e) => {
                const loc = TW_CITIES.find((c) => c.label === e.target.value);
                if (loc) onChangeCity(loc);
              }}
              className="mr-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50"
              title="選擇天氣城市"
            >
              {TW_CITIES.map((c) => (
                <option key={c.label} value={c.label}>
                  🌤 {c.label}
                </option>
              ))}
            </select>
          )}
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

      {/* 手機：一天一列（清單式）；桌面：七欄平均分配 */}
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-7 md:gap-1.5">
        {days.map((d) => {
          const cards = cardsOf(d);
          return (
            <div
              key={d.toISOString()}
              className={`min-w-0 rounded-xl p-1.5 ${
                isToday(d) ? "bg-indigo-50/70 ring-1 ring-indigo-200" : "bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between pb-1 pl-1">
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
              {weather[dateStr(d)] &&
                (() => {
                  const w = weather[dateStr(d)];
                  const { emoji } = weatherIcon(w.code);
                  const ds = dateStr(d);
                  return (
                    <button
                      onClick={() => hourly[ds]?.length && setWeatherDay(ds)}
                      className="mb-1.5 flex w-full items-center justify-center gap-1 rounded-lg bg-white/70 px-1.5 py-1 text-[11px] ring-1 ring-slate-100 transition hover:bg-white hover:ring-sky-200"
                      title="點看逐時降雨"
                    >
                      <span>{emoji}</span>
                      <span className="font-semibold text-slate-700">{Math.round(w.max)}°</span>
                      <span className="text-slate-400">{Math.round(w.min)}°</span>
                      {w.rain != null && w.rain >= 40 && (
                        <span className="text-sky-600">💧{w.rain}%</span>
                      )}
                    </button>
                  );
                })()}

              <div className="space-y-1.5">
                {cards.length === 0 && (
                  <p className="py-1 text-center text-xs text-slate-300 md:py-3">－</p>
                )}
                {cards.map(({ ev, subs, spillover }) => {
                  const done = subs.filter((s) => s.done).length;
                  const key = `${ev.id}:${dateStr(d)}`;
                  const isOpen = expanded.has(key);
                  return (
                    <div
                      key={key}
                      onClick={() => onEdit(ev)}
                      className={`cursor-pointer rounded-lg border p-1.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
                        spillover ? "border-dashed border-slate-300 bg-slate-50/60" : "border-slate-200 bg-white"
                      }`}
                      style={{ borderLeft: `3px solid ${ev.color}` }}
                    >
                      <div className="flex items-start gap-1">
                        {spillover ? (
                          <span className="mt-0.5 shrink-0 text-[10px]" title="明細延期到這天">
                            ↪
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={Boolean(ev.completed)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => onToggle(ev.id, !ev.completed)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-500"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={`break-words text-xs font-medium leading-snug ${
                              !spillover && ev.completed
                                ? "text-slate-400 line-through"
                                : "text-slate-800"
                            }`}
                          >
                            {ev.title}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {spillover
                              ? "延期明細"
                              : ev.all_day
                                ? "整天"
                                : `${fmtTime(ev.start_time)}–${fmtTime(ev.end_time)}`}
                          </p>
                        </div>
                      </div>

                      {/* 明細：分身卡預設展開；主項卡點徽章展開 */}
                      {subs.length > 0 &&
                        (spillover ? (
                          <div
                            className="mt-1 space-y-0.5 border-t border-slate-100 pt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {subs.map((st) => (
                              <label
                                key={st.id}
                                className="flex cursor-pointer items-start gap-1.5 rounded-md px-1 py-0.5 hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={st.done}
                                  onChange={() => onToggleSubtask(st)}
                                  className="mt-0.5 h-3 w-3 shrink-0 cursor-pointer accent-emerald-500"
                                />
                                <span
                                  className={`break-words text-[11px] leading-snug ${
                                    st.done ? "text-slate-400 line-through" : "text-slate-600"
                                  }`}
                                >
                                  {st.title}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(key);
                              }}
                              className={`mt-1 flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium transition hover:bg-slate-50 ${
                                done === subs.length ? "text-emerald-500" : "text-indigo-500"
                              }`}
                            >
                              ☑ {done}/{subs.length}
                              <svg
                                className={`h-2.5 w-2.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                            {isOpen && (
                              <div
                                className="mt-0.5 space-y-0.5 border-t border-slate-100 pt-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {subs.map((st) => (
                                  <label
                                    key={st.id}
                                    className="flex cursor-pointer items-start gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={st.done}
                                      onChange={() => onToggleSubtask(st)}
                                      className="mt-0.5 h-3 w-3 shrink-0 cursor-pointer accent-emerald-500"
                                    />
                                    <span
                                      className={`break-words text-[11px] leading-snug ${
                                        st.done ? "text-slate-400 line-through" : "text-slate-600"
                                      }`}
                                    >
                                      {st.title}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </>
                        ))}

                      {!spillover && ev.image && (
                        <img
                          src={ev.image}
                          alt=""
                          onClick={(e) => {
                            e.stopPropagation();
                            openImage(ev.image);
                          }}
                          className="mt-1 w-full cursor-zoom-in rounded-md border border-slate-100 object-cover"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {weatherDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setWeatherDay(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="font-black text-slate-900">
                逐時天氣
                <span className="ml-2 text-sm font-medium text-slate-400">
                  {new Date(`${weatherDay}T00:00`).toLocaleDateString("zh-TW", {
                    month: "numeric",
                    day: "numeric",
                    weekday: "short",
                  })}
                  {weatherLoc?.label ? `・${weatherLoc.label}` : ""}
                </span>
              </h3>
              <button
                onClick={() => setWeatherDay(null)}
                className="rounded-md px-2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {(hourly[weatherDay] ?? []).map((h) => {
                const { emoji } = weatherIcon(h.code);
                const rain = h.rain ?? 0;
                return (
                  <div key={h.time} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-12 shrink-0 text-sm font-medium text-slate-600">{h.time}</span>
                    <span className="w-5 shrink-0 text-center">{emoji}</span>
                    <span className="w-10 shrink-0 text-sm text-slate-500">
                      {h.temp != null ? `${Math.round(h.temp)}°` : ""}
                    </span>
                    {/* 降雨機率長條 */}
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${rain}%` }}
                      />
                    </div>
                    <span
                      className={`w-12 shrink-0 text-right text-sm font-semibold ${
                        rain >= 60 ? "text-sky-600" : rain >= 30 ? "text-sky-500" : "text-slate-400"
                      }`}
                    >
                      💧{rain}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
