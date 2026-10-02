// 可用的 Ollama 模型清單（依本機硬體挑選：RTX 4060 8GB VRAM）。
// 之後若安裝了新模型，在這裡加一行即可。
export const OLLAMA_MODELS = [
  { value: "qwen3:8b", label: "qwen3:8b — 通用（推薦）" },
  { value: "qwen2.5-coder:7b", label: "qwen2.5-coder:7b — 寫程式" },
  { value: "qwen3:14b", label: "qwen3:14b — 高品質（較慢）" },
];

export const DEFAULT_MODEL = OLLAMA_MODELS[0].value;

// ---------- 員工頭像 ----------

/** 依名稱/角色關鍵字挑一個代表 emoji。 */
export function agentEmoji(agent) {
  const text = `${agent?.name ?? ""} ${agent?.role ?? ""}`;
  if (/程式|工程|code|dev/i.test(text)) return "💻";
  if (/出差|簡報|工作|業務/.test(text)) return "💼";
  if (/家|管家/.test(text)) return "🏠";
  if (/旅|遊|行程|玩/.test(text)) return "✈️";
  if (/個人|自己|助理/.test(text)) return "🙋";
  return "🤖";
}

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
];

/** 依 id 取一個穩定的漸層配色，讓每個員工有自己的顏色。 */
export function agentGradient(agent) {
  const id = agent?.id ?? 0;
  return AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];
}

// ---------- 狀態 ----------
export const STATUSES = ["active", "idle", "disabled"];

export const STATUS_LABELS = {
  active: "工作中",
  idle: "待命",
  disabled: "停用",
};

export const STATUS_DOT = {
  active: "bg-emerald-500",
  idle: "bg-amber-400",
  disabled: "bg-slate-300",
};

export const STATUS_PILL = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  idle: "bg-amber-50 text-amber-700 ring-amber-200",
  disabled: "bg-slate-100 text-slate-500 ring-slate-200",
};
