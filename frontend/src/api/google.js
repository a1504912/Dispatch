import client, { getToken } from "./client";

const baseURL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "5173"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin);

export async function getGoogleStatus() {
  const { data } = await client.get("/api/google/status");
  return data;
}

// 直接把瀏覽器導去後端的登入端點（會再 302 到 Google 同意畫面）。
// 瀏覽器導頁帶不了 Authorization header，改用 query string 帶 token。
export function startGoogleLogin() {
  const token = getToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  window.location.href = `${baseURL}/api/google/login${query}`;
}

export async function previewGoogleSync() {
  const { data } = await client.post("/api/google/sync/preview");
  return data; // { new_events: [...] }
}

// selectedIds: null = 匯入全部新項目；陣列 = 只匯入這些
export async function syncGoogle(selectedIds = null) {
  const { data } = await client.post("/api/google/sync", { selected_ids: selectedIds });
  return data;
}

export async function disconnectGoogle() {
  await client.post("/api/google/disconnect");
}
