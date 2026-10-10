import client from "./client";

export async function getClaudeUsage() {
  const { data } = await client.get("/api/claude/usage");
  return data;
}

export async function getClaudeSettings() {
  const { data } = await client.get("/api/claude/settings");
  return data;
}

export async function saveClaudeSettings(payload) {
  const { data } = await client.put("/api/claude/settings", payload);
  return data;
}
