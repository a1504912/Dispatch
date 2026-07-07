import client, { setToken } from "./client";
import { LOCAL_MODE } from "../localMode";

export async function getAuthStatus() {
  if (LOCAL_MODE) return { auth_required: false }; // 資料只在自己瀏覽器，不需登入
  const { data } = await client.get("/api/auth/status");
  return data; // {auth_required: bool}
}

export async function login(password) {
  const { data } = await client.post("/api/auth/login", { password });
  setToken(data.token);
  return data;
}

export function logout() {
  setToken("");
  window.location.href = "/login";
}
