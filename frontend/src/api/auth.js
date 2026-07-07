import client, { setToken } from "./client";

export async function getAuthStatus() {
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
