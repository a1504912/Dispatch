import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthStatus, login, loginSupabase } from "../api/auth";
import { SUPABASE_MODE } from "../supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 已登入或沒開登入功能 → 直接進主頁
  useEffect(() => {
    getAuthStatus()
      .then((s) => {
        if (!s.auth_required || s.logged_in) navigate("/dashboard", { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const canSubmit = SUPABASE_MODE ? email && password : Boolean(password);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");
    try {
      if (SUPABASE_MODE) await loginSupabase(email, password);
      else await login(password);
      navigate("/dashboard", { replace: true });
    } catch {
      setError(SUPABASE_MODE ? "帳號或密碼錯誤，再試一次。" : "密碼錯誤，再試一次。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/50">
            <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Dispatch</h1>
          <p className="mt-1 text-sm text-slate-400">
            {SUPABASE_MODE ? "登入你的雲端行事曆" : "輸入密碼進入你的 AI 助理團隊"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
        >
          {SUPABASE_MODE && (
            <input
              type="email"
              autoFocus
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          )}
          <input
            type="password"
            autoFocus={!SUPABASE_MODE}
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
          >
            {loading ? "登入中…" : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
