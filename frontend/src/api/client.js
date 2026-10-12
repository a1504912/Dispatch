import axios from "axios";

export const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Shared axios instance for all Dispatch API calls.
const client = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

export default client;

// Turn a backend-relative path (e.g. "/uploads/x.png") into a full URL.
export const assetUrl = (path) => `${baseURL.replace(/\/$/, "")}${path}`;

// Best-effort readable message from an axios error.
export function errorMessage(err, fallback = "操作失敗，請確認 backend 是否啟動。") {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return fallback;
}
