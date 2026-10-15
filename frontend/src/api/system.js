import client from "./client";

export async function getUpdateAvailable() {
  const { data } = await client.get("/api/system/update-available");
  return data;
}

export async function runUpdate() {
  const { data } = await client.post("/api/system/update");
  return data;
}

export async function getVersion() {
  const { data } = await client.get("/api/system/version");
  return data;
}

export async function checkUpdates() {
  const { data } = await client.post("/api/system/check-updates");
  return data;
}

export async function getUpdateStatus() {
  const { data } = await client.get("/api/system/update-status");
  return data;
}

// 從某個版本到目前主機版本之間的更新內容
export async function getChangelog(since) {
  const { data } = await client.get("/api/system/changelog", { params: { since } });
  return data; // { ok, commits: [{ hash, subject, points, date }] }
}
