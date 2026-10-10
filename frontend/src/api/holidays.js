// 台灣國定假日 / 補假 / 補班（後端整理自人事行政總處辦公日曆表）。
import { useEffect, useState } from "react";
import client from "./client";

const cache = new Map(); // year → { "YYYY-MM-DD": { type: "off" | "work", name } }
const pending = new Map(); // year → Promise

function loadYear(year) {
  if (cache.has(year)) return Promise.resolve(cache.get(year));
  if (pending.has(year)) return pending.get(year);
  const p = client
    .get("/api/holidays", { params: { start: `${year}-01-01`, end: `${year}-12-31` } })
    .then(({ data }) => {
      const map = {};
      for (const h of data || []) map[h.date] = { type: h.type, name: h.name };
      cache.set(year, map);
      return map;
    })
    .catch(() => ({})) // 抓不到就不顯示，下次再試
    .finally(() => pending.delete(year));
  pending.set(year, p);
  return p;
}

// 傳入要用到的年份，回傳合併後的 { "YYYY-MM-DD": { type, name } }
export function useHolidays(years) {
  const key = [...new Set(years.filter(Boolean))].sort().join(",");
  const [map, setMap] = useState(() => merge(key));
  useEffect(() => {
    let alive = true;
    const ys = key ? key.split(",").map(Number) : [];
    setMap(merge(key));
    Promise.all(ys.map(loadYear)).then(() => alive && setMap(merge(key)));
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

function merge(key) {
  const out = {};
  for (const y of key ? key.split(",").map(Number) : []) Object.assign(out, cache.get(y) || {});
  return out;
}
