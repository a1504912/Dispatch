import client, { setToken } from "./client";
import { LOCAL_MODE } from "../localMode";
import { SUPABASE_MODE, supabase } from "../supabase";

export async function getAuthStatus() {
  if (SUPABASE_MODE) {
    const { data } = await supabase.auth.getSession();
    return { auth_required: true, logged_in: Boolean(data.session) };
  }
  if (LOCAL_MODE) return { auth_required: false }; // 資料只在自己瀏覽器，不需登入
  const { data } = await client.get("/api/auth/status");
  return data; // {auth_required: bool}
}

export async function login(password) {
  const { data } = await client.post("/api/auth/login", { password });
  setToken(data.token);
  return data;
}

export async function loginSupabase(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export function logout() {
  if (SUPABASE_MODE) {
    supabase.auth.signOut().finally(() => {
      window.location.href = "/login";
    });
    return;
  }
  setToken("");
  window.location.href = "/login";
}
