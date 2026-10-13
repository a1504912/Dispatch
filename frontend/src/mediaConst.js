// 自媒體共用的平台、狀態、顏色與格式化。

// 各平台文案字數上限（字數計數器用）
export const PLATFORMS = [
  { value: "instagram", label: "Instagram", limit: 2200 },
  { value: "facebook", label: "Facebook", limit: 63206 },
  { value: "threads", label: "Threads", limit: 500 },
  { value: "youtube", label: "YouTube", limit: 5000 },
  { value: "tiktok", label: "TikTok", limit: 4000 },
  { value: "x", label: "X", limit: 280 },
  { value: "blog", label: "部落格", limit: null },
  { value: "other", label: "其他", limit: null },
];

export const platformLabel = (v) => PLATFORMS.find((p) => p.value === v)?.label || v;

export const STATUSES = [
  { value: "idea", label: "點子", style: "bg-slate-100 text-slate-600" },
  { value: "draft", label: "草稿", style: "bg-amber-100 text-amber-800" },
  { value: "scheduled", label: "已排程", style: "bg-sky-100 text-sky-700" },
  { value: "published", label: "已發佈", style: "bg-emerald-100 text-emerald-700" },
];

export const statusOf = (v) => STATUSES.find((s) => s.value === v) || STATUSES[0];

// 主題顏色：固定順序的色盲友善色盤，新主題自動取下一個沒用過的
export const PILLAR_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export function nextPillarColor(pillars) {
  const used = new Set(pillars.map((p) => p.color));
  return PILLAR_COLORS.find((c) => !used.has(c)) || PILLAR_COLORS[0];
}

// "2026-10-12T15:47:11" → "2026-10-12T15:47"（給 datetime-local 輸入框）
export const toInputDateTime = (v) => (v ? v.slice(0, 16) : "");
export const fmtDateTime = (v) => (v ? v.slice(0, 16).replace("T", " ") : "");
export const fmtNum = (n) => (n ?? 0).toLocaleString("zh-TW");
export const pct = (n) => `${(n ?? 0).toFixed(1)}%`;

export function compactNum(n) {
  if (n >= 10000) return `${+(n / 10000).toFixed(1)}萬`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}K`;
  return String(n);
}

export const errMsg = (e) => e?.response?.data?.detail || e?.message || "失敗";

export const field =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";
