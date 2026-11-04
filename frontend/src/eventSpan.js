// 行程佔到哪幾天。整天行程的 end 是「最後一天的隔天 0 點」（不含），
// 所以 11/16–11/17 兩天存成 start=11/16 00:00、end=11/18 00:00。
// 沒有 end、或 end 不晚於 start 的舊資料，就只算開始那天。
const DAY = 86400000;

function dayBounds(day) {
  const s = new Date(day);
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  e.setDate(e.getDate() + 1);
  return [s, e];
}

export function coversDay(start, end, day) {
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return false;
  const [ds, de] = dayBounds(day);
  const e = end ? new Date(end) : null;
  if (!e || Number.isNaN(e.getTime()) || e <= s) return s >= ds && s < de;
  return s < de && e > ds;
}

// 跨好幾天的行程：回傳 { index, total }（第幾天／共幾天）；只有一天就回 null
export function spanInfo(start, end, day) {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  if (Number.isNaN(s.getTime()) || !e || Number.isNaN(e.getTime()) || e <= s) return null;
  const [s0] = dayBounds(s);
  const [e0] = dayBounds(new Date(e.getTime() - 1)); // 最後佔到的那天
  const total = Math.round((e0 - s0) / DAY) + 1;
  if (total <= 1) return null;
  const [d0] = dayBounds(day);
  return { index: Math.round((d0 - s0) / DAY) + 1, total };
}
