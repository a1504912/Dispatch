import client from "./client";

export async function listAgents() {
  const { data } = await client.get("/api/agents");
  return data;
}

export async function createAgent(agent) {
  const { data } = await client.post("/api/agents", agent);
  return data;
}

export async function deleteAgent(id) {
  await client.delete(`/api/agents/${id}`);
}

export async function updateAgentStatus(id, status) {
  const { data } = await client.patch(`/api/agents/${id}/status`, { status });
  return data;
}
