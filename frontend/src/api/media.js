import client from "./client";

// ---------- 主題方向 ----------
export async function listPillars() {
  const { data } = await client.get("/api/media/pillars");
  return data;
}

export async function savePillar(pillar) {
  const { id, created_at, ...body } = pillar;
  const { data } = id
    ? await client.put(`/api/media/pillars/${id}`, body)
    : await client.post("/api/media/pillars", body);
  return data;
}

export async function deletePillar(id) {
  await client.delete(`/api/media/pillars/${id}`);
}

// ---------- 貼文 ----------
// 列表只有縮圖（thumb）與張數（image_count）；開單篇才有完整 images
export async function listPosts() {
  const { data } = await client.get("/api/media/posts");
  return data;
}

export async function getPost(id) {
  const { data } = await client.get(`/api/media/posts/${id}`);
  return data;
}

export async function createPost(body) {
  const { data } = await client.post("/api/media/posts", body);
  return data;
}

export async function updatePost(id, body) {
  const { data } = await client.put(`/api/media/posts/${id}`, body);
  return data;
}

export async function deletePost(id) {
  await client.delete(`/api/media/posts/${id}`);
}

// ---------- 成效數據 ----------
export async function listMetrics(postId) {
  const { data } = await client.get(`/api/media/posts/${postId}/metrics`);
  return data;
}

export async function addMetric(postId, metric) {
  const { data } = await client.post(`/api/media/posts/${postId}/metrics`, metric);
  return data;
}

export async function deleteMetric(postId, metricId) {
  await client.delete(`/api/media/posts/${postId}/metrics/${metricId}`);
}

// ---------- 分析 / AI ----------
export async function getAnalytics(days = null) {
  const { data } = await client.get("/api/media/analytics", { params: days ? { days } : {} });
  return data;
}

// provider = gpt / claude；mode = draft / titles / hashtags / polish / ideas
export async function assist(body) {
  const { data } = await client.post("/api/media/assist", body, { timeout: 200000 });
  return data;
}
