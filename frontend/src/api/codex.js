import client from "./client";

export async function getCodexUsage() {
  const { data } = await client.get("/api/codex/usage");
  return data;
}

export async function getCodexSettings() {
  const { data } = await client.get("/api/codex/settings");
  return data;
}

export async function saveCodexSettings(payload) {
  const { data } = await client.put("/api/codex/settings", payload);
  return data;
}
