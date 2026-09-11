import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listCategories() {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("categories").select("*").order("created_at"));
  }
  if (LOCAL_MODE) return store.list(KEYS.categories);
  const { data } = await client.get("/api/categories");
  return data;
}

export async function createCategory(category) {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("categories").insert(category).select().single());
  }
  if (LOCAL_MODE) return store.insert(KEYS.categories, category);
  const { data } = await client.post("/api/categories", category);
  return data;
}

export async function updateCategory(id, category) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase.from("categories").update(category).eq("id", id).select().single()
    );
  }
  if (LOCAL_MODE) return store.update(KEYS.categories, id, category);
  const { data } = await client.put(`/api/categories/${id}`, category);
  return data;
}

export async function deleteCategory(id) {
  if (SUPABASE_MODE) {
    // 使用中的行程由資料庫的 on delete set null 改回未分類
    orThrow(await supabase.from("categories").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.categories, id);
    store.updateWhere(KEYS.events, (e) => e.category_id === id, { category_id: null });
    return;
  }
  await client.delete(`/api/categories/${id}`);
}
