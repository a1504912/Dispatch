import client from "./client";

export async function listPillars() {
  const { data } = await client.get("/api/pillars");
  return data;
}

export async function createPillar(pillar) {
  const { data } = await client.post("/api/pillars", pillar);
  return data;
}

export async function updatePillar(id, changes) {
  const { data } = await client.patch(`/api/pillars/${id}`, changes);
  return data;
}

export async function deletePillar(id) {
  await client.delete(`/api/pillars/${id}`);
}
