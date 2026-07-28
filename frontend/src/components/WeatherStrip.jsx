import { useEffect, useState } from "react";
import { getWeatherLoc, getWeekForecast, weatherIcon } from "../api/weather";

export default function WeatherStrip() {
  const [loc] = useState(getWeatherLoc);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getWeekForecast(loc)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [loc]);

  if (error) return null; // 天氣抓不到就靜默不顯示，不干擾主功能

  const daily = data?.daily;
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-bold text-slate-700">本週天氣</span>
        <span className="text-xs text-slate-400">{loc.label}</span>
      </div>
      {!daily ? (
        <p className="py-3 text-center text-xs text-slate-300">載入天氣中…</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {daily.time.map((day, i) => {
            const d = new Date(`${day}T00:00`);
            const isToday = day === todayStr;
            const { emoji, label } = weatherIcon(daily.weather_code[i]);
            const rain = daily.precipitation_probability_max?.[i];
            return (
              <div
                key={day}
                className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 ${
                  isToday ? "bg-indigo-50 ring-1 ring-indigo-200" : "bg-slate-50"
                }`}
                title={label}
              >
                <span
                  className={`text-xs font-medium ${
                    isToday ? "text-indigo-700" : "text-slate-500"
                  }`}
                >
                  {isToday ? "今天" : d.toLocaleDateString("zh-TW", { weekday: "short" })}
                </span>
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="text-xs font-bold text-slate-800">
                  {Math.round(daily.temperature_2m_max[i])}°
                  <span className="ml-0.5 font-normal text-slate-400">
                    {Math.round(daily.temperature_2m_min[i])}°
                  </span>
                </span>
                {rain != null && (
                  <span className={`text-[10px] ${rain >= 50 ? "text-sky-600" : "text-slate-400"}`}>
                    💧{rain}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
