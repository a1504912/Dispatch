// 個人偏好設定：存主機（手機、電腦共用）；離線模式或連不到時退回這台瀏覽器的 localStorage
import client from "./client";
import { NO_BACKEND } from "../localMode";

const lsKey = (k) => `dispatch.pref.${k}`;
function lsGet(k, fallback) {
  try {
    const v = localStorage.getItem(lsKey(k));
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(lsKey(k), JSON.stringify(v));
  } catch {
    /* 無痕模式 */
  }
}

export async function getPref(key, fallback) {
  if (NO_BACKEND) return lsGet(key, fallback);
  try {
    const { data } = await client.get(`/api/prefs/${key}`);
    lsSet(key, data.value);
    return data.value;
  } catch {
    return lsGet(key, fallback);
  }
}

export async function setPref(key, value) {
  lsSet(key, value);
  if (NO_BACKEND) return value;
  const { data } = await client.put(`/api/prefs/${key}`, { value });
  return data.value;
}
