import axios from "axios";

// 預設規則：Vite 開發模式（port 5173）打同主機的 :8000；
// 其他情況（由後端直接供應網頁）就打同一個網址。
const baseURL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "5173"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin);

const client = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const TOKEN_KEY = "dispatch.token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// 自動夾帶登入 token
client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401（未登入/密碼已改）→ 清掉 token 導回登入頁
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes("/api/auth/") &&
      window.location.pathname !== "/login"
    ) {
      setToken("");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default client;
