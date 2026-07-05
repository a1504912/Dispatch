import axios from "axios";

// 預設跟著目前網址的主機走：用 localhost 開就打 localhost:8000、
// 用區網/Tailscale IP 開就打同一台的 :8000，遠端連線才不會打錯機器。
const baseURL =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

// Shared axios instance for all Dispatch API calls.
const client = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

export default client;
