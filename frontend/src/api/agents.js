import client from "./client";
import { NO_BACKEND } from "../localMode";

export async function listAgents() {
  if (NO_BACKEND) return []; // 沒有後端就沒有 AI 員工
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
