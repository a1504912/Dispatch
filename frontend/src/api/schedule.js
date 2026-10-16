import client from "./client";

export async function generateSchedule(tasks, agentId = null) {
  const { data } = await client.post("/api/schedule/generate", {
    tasks,
    agent_id: agentId,
  });
  return data;
}

// provider：ollama（本地視覺模型）/ gpt / claude（主機上的 CLI）
export async function scheduleFromImage(file, model, hint, provider = "ollama") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("provider", provider);
  if (model && provider === "ollama") formData.append("model", model);
  if (hint) formData.append("hint", hint);
  const { data } = await client.post("/api/schedule/from-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600000, // CPU 推論較慢，給 10 分鐘
  });
  return data;
}

// 打字描述 → AI 拆成行程（還沒存）
export async function scheduleFromText(text, provider = "gpt", model) {
  const { data } = await client.post(
    "/api/schedule/from-text",
    { text, provider, model: provider === "ollama" ? model || null : null },
    { timeout: 600000 }
  );
  return data;
}
