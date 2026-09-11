import client from "./client";

export async function generateSchedule(tasks, agentId = null) {
  const { data } = await client.post("/api/schedule/generate", {
    tasks,
    agent_id: agentId,
  });
  return data;
}

export async function scheduleFromImage(file, model, hint) {
  const formData = new FormData();
  formData.append("file", file);
  if (model) formData.append("model", model);
  if (hint) formData.append("hint", hint);
  const { data } = await client.post("/api/schedule/from-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600000, // CPU 推論較慢，給 10 分鐘
  });
  return data;
}
