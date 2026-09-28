import client from "./client";

export async function getDay(date) {
  const { data } = await client.get("/api/health/day", { params: date ? { date } : {} });
  return data;
}

export async function getWeights(days = 60) {
  const { data } = await client.get("/api/health/weights", { params: { days } });
  return data;
}

export async function addLog(payload) {
  const { data } = await client.post("/api/health", payload);
  return data;
}

export async function deleteLog(id) {
  await client.delete(`/api/health/${id}`);
}

export async function getHealthSettings() {
  const { data } = await client.get("/api/health/settings");
  return data;
}

export async function saveHealthSettings(payload) {
  const { data } = await client.put("/api/health/settings", payload);
  return data;
}
