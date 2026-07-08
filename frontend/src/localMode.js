import { SUPABASE_MODE } from "./supabase";

// 離線模式：資料存在瀏覽器 localStorage，不需要後端。
// 部署到 Vercel 等純靜態環境時，設定環境變數 VITE_LOCAL_MODE=1 啟用。
export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === "1" && !SUPABASE_MODE;

// 沒有 FastAPI 後端可用（離線或 Supabase 雲端模式）→ AI / Google 功能隱藏
export const NO_BACKEND = LOCAL_MODE || SUPABASE_MODE;
