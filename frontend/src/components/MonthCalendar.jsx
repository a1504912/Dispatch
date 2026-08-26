const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const pad2 = (n) => String(n).padStart(2, "0");
const compact = (n) => (n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`);

// dayData: { "YYYY-MM-DD": { expense, income } }
export default function MonthCalendar({
  year,
  month, // 1-12
  dayData = {},
  todayStr,
  selectedDay,
  onSelectDay,
  onPrev,
  onNext,
  onToday,
  monthLabel,
}) {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const navBtn =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      {/* 標頭：月份 + 前後月 */}
      <div className="mb-2 flex items-center justify-between">
        <button onClick={onPrev} className={navBtn}>‹</button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-800">{monthLabel}</span>
          <button onClick={onToday} className="rounded-md px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">今天</button>
        </div>
        <button onClick={onNext} className={navBtn}>›</button>
      </div>

      {/* 星期列 */}
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      {/* 日期格 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const ds = `${year}-${pad2(month)}-${pad2(d)}`;
          const data = dayData[ds];
          const isToday = ds === todayStr;
          const isSel = ds === selectedDay;
          return (
            <button
              key={ds}
              onClick={() => onSelectDay(isSel ? null : ds)}
              className={`flex min-h-[3.2rem] flex-col items-center rounded-lg px-0.5 py-1 transition ${
                isSel ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  isToday ? "bg-emerald-500 text-white" : "text-slate-700"
                }`}
              >
                {d}
              </span>
              {data?.expense > 0 && (
                <span className="mt-0.5 text-[9px] leading-none text-slate-400">{compact(data.expense)}</span>
              )}
              {!data?.expense && data?.income > 0 && (
                <span className="mt-0.5 text-[9px] leading-none text-emerald-500">+{compact(data.income)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
