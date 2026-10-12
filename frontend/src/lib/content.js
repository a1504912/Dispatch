// Shared labels and constants for the 自媒體 content studio.

// Caption length guides per platform (characters). Used for the live counter.
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

export const platformLabel = (value) =>
  PLATFORMS.find((p) => p.value === value)?.label || value;

export const STATUSES = [
  { value: "idea", label: "點子", style: "bg-gray-100 text-gray-600" },
  { value: "draft", label: "草稿", style: "bg-yellow-100 text-yellow-800" },
  { value: "scheduled", label: "已排程", style: "bg-blue-100 text-blue-700" },
  { value: "published", label: "已發佈", style: "bg-green-100 text-green-700" },
];

export const statusOf = (value) => STATUSES.find((s) => s.value === value) || STATUSES[0];

// Pillar colors, in fixed order. This is a colorblind-checked categorical
// palette; new pillars take the next unused slot so colors stay distinct.
export const PILLAR_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];

export function nextPillarColor(pillars) {
  const used = new Set(pillars.map((p) => p.color));
  return PILLAR_COLORS.find((c) => !used.has(c)) || PILLAR_COLORS[0];
}

// "2026-10-12T15:47:11.356" -> "2026-10-12T15:47" for <input type="datetime-local">
export const toInputDateTime = (value) => (value ? value.slice(0, 16) : "");

export const formatDateTime = (value) =>
  value ? value.slice(0, 16).replace("T", " ") : "";

export const formatNumber = (n) => (n ?? 0).toLocaleString("zh-TW");

export function compactNumber(n) {
  if (n >= 10000) return `${+(n / 10000).toFixed(1)}萬`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}K`;
  return String(n);
}
