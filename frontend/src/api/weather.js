// 天氣預報：Open-Meteo 免費 API，瀏覽器直接呼叫（不需後端、不需金鑰）。

export const TW_CITIES = [
  { label: "台北", lat: 25.03, lon: 121.57 },
  { label: "新北", lat: 25.01, lon: 121.46 },
  { label: "基隆", lat: 25.13, lon: 121.74 },
  { label: "桃園", lat: 24.99, lon: 121.31 },
  { label: "新竹", lat: 24.8, lon: 120.97 },
  { label: "台中", lat: 24.15, lon: 120.68 },
  { label: "彰化", lat: 24.08, lon: 120.54 },
  { label: "嘉義", lat: 23.48, lon: 120.45 },
  { label: "台南", lat: 22.99, lon: 120.21 },
  { label: "高雄", lat: 22.63, lon: 120.3 },
  { label: "屏東", lat: 22.68, lon: 120.49 },
  { label: "宜蘭", lat: 24.76, lon: 121.75 },
  { label: "花蓮", lat: 23.98, lon: 121.6 },
  { label: "台東", lat: 22.76, lon: 121.14 },
];

const LOC_KEY = "dispatch.weatherLoc";
const CACHE_KEY = "dispatch.weatherCache";
const CACHE_MS = 30 * 60 * 1000; // 30 分鐘

export function getWeatherLoc() {
  try {
    return JSON.parse(localStorage.getItem(LOC_KEY)) || TW_CITIES[0];
  } catch {
    return TW_CITIES[0];
  }
}

export function setWeatherLoc(loc) {
  localStorage.setItem(LOC_KEY, JSON.stringify(loc));
}

export async function getWeekForecast(loc) {
  const key = `${loc.lat},${loc.lon}`;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && cached.key === key && Date.now() - cached.ts < CACHE_MS) {
      return cached.data;
    }
  } catch {
    // ignore
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather fetch failed");
  const data = await res.json();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, ts: Date.now(), data }));
  } catch {
    // ignore
  }
  return data;
}

// WMO weather code → emoji + 說明
export function weatherIcon(code) {
  if (code === 0) return { emoji: "☀️", label: "晴" };
  if (code <= 2) return { emoji: "🌤️", label: "多雲時晴" };
  if (code === 3) return { emoji: "☁️", label: "陰" };
  if (code <= 48) return { emoji: "🌫️", label: "霧" };
  if (code <= 57) return { emoji: "🌦️", label: "毛毛雨" };
  if (code <= 67) return { emoji: "🌧️", label: "雨" };
  if (code <= 77) return { emoji: "🌨️", label: "雪" };
  if (code <= 82) return { emoji: "🌧️", label: "陣雨" };
  if (code <= 86) return { emoji: "🌨️", label: "陣雪" };
  return { emoji: "⛈️", label: "雷雨" };
}
