// 可用的 Ollama 模型清單（依本機硬體挑選：RTX 4060 8GB VRAM）。
// 之後若安裝了新模型，在這裡加一行即可。
export const OLLAMA_MODELS = [
  { value: "qwen3:8b", label: "qwen3:8b — 通用（推薦）" },
  { value: "qwen2.5-coder:7b", label: "qwen2.5-coder:7b — 寫程式" },
  { value: "qwen3:14b", label: "qwen3:14b — 高品質（較慢）" },
];

export const DEFAULT_MODEL = OLLAMA_MODELS[0].value;
