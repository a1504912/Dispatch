import client from "./client";

// 瀏覽器是否支援 Web Push（需要 HTTPS 或 localhost）
export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// iOS/iPadOS 需先「加到主畫面」以獨立 App 開啟，才允許通知
export function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}
export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getRegistration() {
  return (
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register("/sw.js"))
  );
}

// 目前這台裝置的通知狀態
export async function getPushStatus() {
  if (!pushSupported()) return { supported: false };
  const permission = Notification.permission; // default / granted / denied
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    subscribed = Boolean(sub);
  } catch {
    subscribed = false;
  }
  return { supported: true, permission, subscribed };
}

// 在這台裝置開啟通知（要求權限 + 訂閱 + 回報後端）
export async function enablePush() {
  if (!pushSupported()) throw new Error("此瀏覽器不支援通知功能");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("你尚未允許通知權限");

  const reg = await getRegistration();
  await navigator.serviceWorker.ready;

  const { data } = await client.get("/api/push/public-key");
  if (!data || typeof data.key !== "string" || !data.key) {
    throw new Error("後端尚未更新，請關掉舊的 win-start 視窗、重新執行 win-start.bat 後再試。");
  }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key),
    });
  }
  await client.post("/api/push/subscribe", { subscription: sub.toJSON() });
  return true;
}

// 在這台裝置關閉通知
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    try {
      await client.post("/api/push/unsubscribe", { endpoint: sub.endpoint });
    } catch {
      /* 後端清不到也沒關係 */
    }
    await sub.unsubscribe();
  }
  return true;
}

export async function sendTestPush() {
  const { data } = await client.post("/api/push/test");
  return data; // { sent, devices }
}

export async function getNotifySettings() {
  const { data } = await client.get("/api/push/settings");
  return data;
}

export async function saveNotifySettings(settings) {
  const { data } = await client.put("/api/push/settings", settings);
  return data;
}
