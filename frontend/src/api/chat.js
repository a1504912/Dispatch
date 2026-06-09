import client from "./client";

export async function sendChat(agentId, message) {
  const { data } = await client.post("/api/chat", {
    agent_id: agentId,
    message,
  });
  return data;
}
