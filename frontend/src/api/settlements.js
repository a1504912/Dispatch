import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listSettlements() {
  if (SUPABASE_MODE) return orThrow(await supabase.from("settlements").select("*").order("date", { ascending: false }));
  if (LOCAL_MODE) return store.list(KEYS.settlements);
  const { data } = await client.get("/api/settlements");
  return data;
}

export async function createSettlement(s) {
  if (SUPABASE_MODE) return orThrow(await supabase.from("settlements").insert(s).select().single());
  if (LOCAL_MODE) return store.insert(KEYS.settlements, s);
  const { data } = await client.post("/api/settlements", s);
  return data;
}

export async function deleteSettlement(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("settlements").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.settlements, id);
    return;
  }
  await client.delete(`/api/settlements/${id}`);
}
