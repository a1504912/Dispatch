import client from "./client";

export async function generateSchedule(tasks, agentId = null) {
  const { data } = await client.post("/api/schedule/generate", {
    tasks,
    agent_id: agentId,
  });
  return data;
}
