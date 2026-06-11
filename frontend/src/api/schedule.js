import client from "./client";

export async function generateSchedule(tasks, agentId = null) {
  const { data } = await client.post("/api/schedule/generate", {
    tasks,
    agent_id: agentId,
  });
  return data;
}

export async function scheduleFromImage(file, model) {
  const formData = new FormData();
  formData.append("file", file);
  if (model) formData.append("model", model);
  const { data } = await client.post("/api/schedule/from-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 180000,
  });
  return data;
}
