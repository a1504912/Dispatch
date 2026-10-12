import client from "./client";

export async function listPosts(filters = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== "" && v != null)
  );
  const { data } = await client.get("/api/posts", { params });
  return data;
}

export async function createPost(post) {
  const { data } = await client.post("/api/posts", post);
  return data;
}

export async function updatePost(id, changes) {
  const { data } = await client.patch(`/api/posts/${id}`, changes);
  return data;
}

export async function deletePost(id) {
  await client.delete(`/api/posts/${id}`);
}

export async function uploadImages(postId, files) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const { data } = await client.post(`/api/posts/${postId}/images`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteImage(postId, imageId) {
  await client.delete(`/api/posts/${postId}/images/${imageId}`);
}

export async function listMetrics(postId) {
  const { data } = await client.get(`/api/posts/${postId}/metrics`);
  return data;
}

export async function addMetric(postId, metric) {
  const { data } = await client.post(`/api/posts/${postId}/metrics`, metric);
  return data;
}

export async function deleteMetric(postId, metricId) {
  await client.delete(`/api/posts/${postId}/metrics/${metricId}`);
}
