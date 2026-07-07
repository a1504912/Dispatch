import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";

export async function listCategories() {
  if (LOCAL_MODE) return store.list(KEYS.categories);
  const { data } = await client.get("/api/categories");
  return data;
}

export async function createCategory(category) {
  if (LOCAL_MODE) return store.insert(KEYS.categories, category);
  const { data } = await client.post("/api/categories", category);
  return data;
}

export async function updateCategory(id, category) {
  if (LOCAL_MODE) return store.update(KEYS.categories, id, category);
  const { data } = await client.put(`/api/categories/${id}`, category);
  return data;
}

export async function deleteCategory(id) {
  if (LOCAL_MODE) {
    store.remove(KEYS.categories, id);
    // 使用中的行程改回未分類
    store.updateWhere(KEYS.events, (e) => e.category_id === id, { category_id: null });
    return;
  }
  await client.delete(`/api/categories/${id}`);
}
