import client from "./client";

export async function listModels() {
  const { data } = await client.get("/api/models");
  return data;
}
