// 離線模式：資料存在瀏覽器 localStorage，不需要後端。
// 部署到 Vercel 等純靜態環境時，設定環境變數 VITE_LOCAL_MODE=1 啟用。
export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === "1";
