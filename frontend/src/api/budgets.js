import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listBudgets() {
  if (SUPABASE_MODE) return orThrow(await supabase.from("budgets").select("*").order("id"));
  if (LOCAL_MODE) return store.list(KEYS.budgets);
  const { data } = await client.get("/api/budgets");
  return data;
}

// 依 category upsert（同分類只留一筆）
export async function setBudget(category, amount) {
  if (SUPABASE_MODE) {
    const existing = orThrow(await supabase.from("budgets").select("*").eq("category", category).maybeSingle());
    if (existing) return orThrow(await supabase.from("budgets").update({ amount }).eq("id", existing.id).select().single());
    return orThrow(await supabase.from("budgets").insert({ category, amount }).select().single());
  }
  if (LOCAL_MODE) {
    const rows = store.list(KEYS.budgets);
    const existing = rows.find((b) => b.category === category);
    if (existing) return store.update(KEYS.budgets, existing.id, { amount });
    return store.insert(KEYS.budgets, { category, amount });
  }
  const { data } = await client.post("/api/budgets", { category, amount });
  return data;
}

export async function deleteBudget(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("budgets").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.budgets, id);
    return;
  }
  await client.delete(`/api/budgets/${id}`);
}
