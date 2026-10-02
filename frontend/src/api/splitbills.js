import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listSplitBills() {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("splitbills").select("*").order("date", { ascending: false }));
  }
  if (LOCAL_MODE) return store.list(KEYS.splitbills);
  const { data } = await client.get("/api/splitbills");
  return data;
}

export async function createSplitBill(bill) {
  if (SUPABASE_MODE) return orThrow(await supabase.from("splitbills").insert(bill).select().single());
  if (LOCAL_MODE) return store.insert(KEYS.splitbills, bill);
  const { data } = await client.post("/api/splitbills", bill);
  return data;
}

export async function deleteSplitBill(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("splitbills").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.splitbills, id);
    return;
  }
  await client.delete(`/api/splitbills/${id}`);
}
