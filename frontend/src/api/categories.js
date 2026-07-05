import client from "./client";

export async function listCategories() {
  const { data } = await client.get("/api/categories");
  return data;
}

export async function createCategory(category) {
  const { data } = await client.post("/api/categories", category);
  return data;
}

export async function updateCategory(id, category) {
  const { data } = await client.put(`/api/categories/${id}`, category);
  return data;
}

export async function deleteCategory(id) {
  await client.delete(`/api/categories/${id}`);
}
