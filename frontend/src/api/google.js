import client from "./client";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function getGoogleStatus() {
  const { data } = await client.get("/api/google/status");
  return data;
}

// 直接把瀏覽器導去後端的登入端點（會再 302 到 Google 同意畫面）
export function startGoogleLogin() {
  window.location.href = `${baseURL}/api/google/login`;
}

export async function syncGoogle() {
  const { data } = await client.post("/api/google/sync");
  return data;
}

export async function disconnectGoogle() {
  await client.post("/api/google/disconnect");
}
