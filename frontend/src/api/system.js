import client from "./client";

export async function getUpdateAvailable() {
  const { data } = await client.get("/api/system/update-available");
  return data;
}

export async function runUpdate() {
  const { data } = await client.post("/api/system/update");
  return data;
}
