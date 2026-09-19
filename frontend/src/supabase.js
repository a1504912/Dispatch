import { createClient } from "@supabase/supabase-js";

// 雲端同步模式：設定 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY 後啟用，
// 資料直接存 Supabase（跨裝置同步），不需要自己的後端。
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_MODE = Boolean(url && anonKey);
export const supabase = SUPABASE_MODE ? createClient(url, anonKey) : null;

/** 丟出帶訊息的錯誤，讓呼叫端的 catch 正常運作。 */
export function orThrow({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
