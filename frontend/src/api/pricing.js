import client from "./client";

// ---------- 專案 ----------

export async function listProjects(status) {
  const { data } = await client.get("/api/pricing", {
    params: status ? { status } : {},
  });
  return data;
}

export async function createProject(payload) {
  const { data } = await client.post("/api/pricing", payload);
  return data;
}

export async function updateProject(id, payload) {
  const { data } = await client.put(`/api/pricing/${id}`, payload);
  return data;
}

export async function deleteProject(id) {
  await client.delete(`/api/pricing/${id}`);
}

export async function markBought(id, payload) {
  const { data } = await client.post(`/api/pricing/${id}/buy`, payload);
  return data;
}

export async function markShopping(id) {
  const { data } = await client.post(`/api/pricing/${id}/unbuy`);
  return data;
}

// ---------- 候選（品牌/報價） ----------

export async function addOption(projectId, payload) {
  const { data } = await client.post(`/api/pricing/${projectId}/options`, payload);
  return data;
}

export async function updateOption(optionId, payload) {
  const { data } = await client.put(`/api/pricing/options/${optionId}`, payload);
  return data;
}

export async function deleteOption(optionId) {
  await client.delete(`/api/pricing/options/${optionId}`);
}
