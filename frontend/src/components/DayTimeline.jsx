import { useEffect, useMemo, useRef, useState } from "react";

// 「天」檢視：橫向時間軸。左邊是日期／星期，上面是時間，行程是一條條橫條，一眼看完今天。
// 重疊的行程自動分成好幾排；點空白處用那個時間新增行程；今天會有一條紅色的「現在」線。
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const LANE_H = 46;

export default function DayTimeline({ date, events, holiday, mobile, onPrev, onNext, onToday, onView, onEventClick, onAdd, onToggle }) {
  const HOUR_W = mobile ? 80 : 120;
  const LABEL_W = mobile ? 64 : 96;
  const scroller = useRef(null);
  const [viewW, setViewW] = useState(800); // 可視寬度：整天行程固定在畫面內，不跟著時間軸捲走
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const dayStart = useMemo(() => new Date(date.getFullYear(), date.getMonth(), date.getDate()), [date]);
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + 86400000), [dayStart]);
  const isToday = ymd(dayStart) === ymd(now);

  // 這天的整天行程（含延期明細分身）與有時間的行程
  const { allDay, timed, lanes } = useMemo(() => {
    const allDay = [];
    const timed = [];
    for (const e of events) {
      const s = new Date(e.start);
      if (Number.isNaN(s.getTime())) continue;
      if (e.allDay) {
        const sd = new Date(s.getFullYear(), s.getMonth(), s.getDate());
        const ed = e.end ? new Date(e.end) : new Date(sd.getTime() + 86400000);
        if (sd < dayEnd && (ed > dayStart || +sd === +dayStart)) allDay.push(e);
        continue;
      }
      const en = e.end ? new Date(e.end) : new Date(s.getTime() + 3600000);
      if (s < dayEnd && en > dayStart) {
        const a = Math.max(s, dayStart);
        const b = Math.min(Math.max(en, new Date(s.getTime() + 15 * 60000)), dayEnd);
        timed.push({ e, s, en, a: (a - dayStart) / 60000, b: (b - dayStart) / 60000 });
      }
    }
    // 分排：每條放進第一個「最後結束時間 ≤ 自己開始」的排
    timed.sort((x, y) => x.a - y.a || y.b - x.b);
    const ends = [];
    for (const t of timed) {
      let lane = ends.findIndex((end) => end <= t.a);
      if (lane === -1) {
        lane = ends.length;
        ends.push(0);
      }
      ends[lane] = t.b;
      t.lane = lane;
    }
    return { allDay, timed, lanes: Math.max(1, ends.length) };
  }, [events, dayStart, dayEnd]);

  // 打開或換天時，捲到「現在」或第一個行程附近
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const firstMin = timed.length ? Math.min(...timed.map((t) => t.a)) : null;
    const nowMin = isToday ? (now - dayStart) / 60000 : null;
    // 今天：從「現在」前一小時開始看；其他天：從第一個行程前半小時（沒有行程就 8 點）
    const focus = Math.max(0, nowMin != null ? nowMin - 60 : (firstMin ?? 8 * 60) - 30);
    el.scrollLeft = (focus / 60) * HOUR_W;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStart, HOUR_W]);

  const width = 24 * HOUR_W;
  const x = (min) => (min / 60) * HOUR_W;
  const nowX = isToday ? x((now - dayStart) / 60000) : null;
  const title = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（週${WD[date.getDay()]}）`;
  const btn = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95";

  function clickTrack(ev) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const min = Math.floor(((ev.clientX - rect.left) / HOUR_W) * 2) * 30; // 對齊半小時
    const s = new Date(dayStart.getTime() + min * 60000);
    onAdd(s, new Date(s.getTime() + 3600000));
  }

  return (
    <div>
      {/* 工具列（跟月／週一樣的位置） */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex">
          <button onClick={onPrev} className={`${btn} rounded-r-none`} aria-label="前一天">‹</button>
          <button onClick={onNext} className={`${btn} -ml-px rounded-l-none`} aria-label="後一天">›</button>
        </div>
        <button onClick={onToday} disabled={isToday} className={`${btn} disabled:opacity-40`}>今天</button>
        <h2 className="mx-auto flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
          {title}
          {holiday && (
            <span className={`tw-hol-badge ${holiday.type === "off" ? "is-off" : "is-work"}`}>{holiday.type === "off" ? holiday.name : "補班"}</span>
          )}
        </h2>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 text-sm">
          {[["dayGridMonth", "月"], ["timeGridWeek", "週"], ["hday", "天"]].map(([k, l]) => (
            <button key={k} onClick={() => onView(k)} className={`px-3 py-1.5 ${k === "hday" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div ref={scroller} className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <div className="relative" style={{ width: LABEL_W + width }}>
          {/* 時間軸 */}
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500">
            <div className="sticky left-0 z-30 shrink-0 border-r border-slate-200 bg-slate-50" style={{ width: LABEL_W }} />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="shrink-0 border-l border-slate-200 px-1 py-1.5 first:border-l-0" style={{ width: HOUR_W }}>
                {h === 0 ? "0:00" : `${h}:00`}
              </div>
            ))}
          </div>

          {/* 整天 */}
          {allDay.length > 0 && (
            <div className="flex border-b border-slate-200">
              <div className="sticky left-0 z-10 flex shrink-0 items-center justify-center border-r border-slate-200 bg-white text-xs font-semibold text-slate-400" style={{ width: LABEL_W }}>整天</div>
              <div style={{ width }}>
              <div className="sticky flex flex-wrap gap-1.5 p-1.5" style={{ left: LABEL_W, width: Math.max(160, viewW - LABEL_W) }}>
                {allDay.map((e) => (
                  <button key={e.id} onClick={() => onEventClick(e)}
                    className={`flex max-w-[22rem] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-white shadow-sm ${e.completed ? "opacity-50" : ""}`}
                    style={{ background: e.color || "#3788d8" }}>
                    {e.spillover ? <span>↪</span> : (
                      <input type="checkbox" checked={Boolean(e.completed)} onClick={(ev) => ev.stopPropagation()} onChange={() => onToggle(e.id, !e.completed)} className="h-3 w-3 accent-emerald-500" />
                    )}
                    <span className={`truncate ${e.completed ? "line-through" : ""}`}>{e.title}</span>
                  </button>
                ))}
              </div>
              </div>
            </div>
          )}

          {/* 這一天：左邊日期星期，右邊時間軸上的行程 */}
          <div className="flex">
            <div className={`sticky left-0 z-10 flex shrink-0 flex-col items-center justify-center border-r border-slate-200 ${isToday ? "bg-indigo-50" : holiday?.type === "off" ? "bg-rose-50" : "bg-white"}`} style={{ width: LABEL_W }}>
              <span className={`text-lg font-black leading-none ${isToday ? "text-indigo-600" : holiday?.type === "off" ? "text-rose-600" : "text-slate-800"}`}>
                {date.getMonth() + 1}/{date.getDate()}
              </span>
              <span className={`mt-1 text-xs font-semibold ${isToday ? "text-indigo-500" : "text-slate-400"}`}>週{WD[date.getDay()]}</span>
              {isToday && <span className="mt-1 rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">今天</span>}
            </div>
            <div
              className="relative cursor-copy"
              style={{ width, height: lanes * LANE_H + 16 }}
              onClick={clickTrack}
              title="點空白處：用這個時間新增行程"
            >
              {/* 小時格線（半小時淡線） */}
              {Array.from({ length: 48 }, (_, i) => (
                <div key={i} className={`absolute inset-y-0 border-l ${i % 2 ? "border-dashed border-slate-100" : "border-slate-200"}`} style={{ left: (i / 2) * HOUR_W }} />
              ))}
              {timed.map((t) => (
                <button
                  key={t.e.id}
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(t.e); }}
                  className={`absolute flex items-center gap-1.5 overflow-hidden rounded-lg px-2 text-left text-white shadow-sm ring-1 ring-black/5 transition hover:z-10 hover:brightness-110 ${t.e.completed ? "opacity-50" : ""}`}
                  style={{ left: x(t.a) + 1, width: Math.max(x(t.b) - x(t.a) - 2, 30), top: 8 + t.lane * LANE_H, height: LANE_H - 6, background: t.e.color || "#3788d8" }}
                  title={`${hm(t.s)}–${hm(t.en)} ${t.e.title}`}
                >
                  <input type="checkbox" checked={Boolean(t.e.completed)} onClick={(ev) => ev.stopPropagation()} onChange={() => onToggle(t.e.id, !t.e.completed)} className="h-3.5 w-3.5 shrink-0 accent-emerald-500" />
                  <span className="min-w-0">
                    <span className={`block truncate text-xs font-bold leading-tight ${t.e.completed ? "line-through" : ""}`}>{t.e.title}</span>
                    <span className="block truncate text-[10px] leading-tight opacity-85">{hm(t.s)}–{hm(t.en)}</span>
                  </span>
                </button>
              ))}
              {nowX != null && (
                <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-rose-500" style={{ left: nowX }}>
                  <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
                </div>
              )}
              {timed.length === 0 && (
                <p className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 px-4 text-xs text-slate-300" style={{ left: (x(isToday ? (now - dayStart) / 60000 : 8 * 60)) }}>
                  這天沒有排時間的行程，點空白處可以新增
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
