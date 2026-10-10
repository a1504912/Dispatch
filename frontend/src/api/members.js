import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listMembers() {
  if (SUPABASE_MODE) return orThrow(await supabase.from("members").select("*").order("id"));
  if (LOCAL_MODE) return store.list(KEYS.members);
  const { data } = await client.get("/api/members");
  return data;
}

export async function createMember(m) {
  if (SUPABASE_MODE) return orThrow(await supabase.from("members").insert(m).select().single());
  if (LOCAL_MODE) return store.insert(KEYS.members, m);
  const { data } = await client.post("/api/members", m);
  return data;
}

export async function updateMember(id, m) {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("members").update(m).eq("id", id).select().single());
  }
  if (LOCAL_MODE) return store.update(KEYS.members, id, m);
  const { data } = await client.put(`/api/members/${id}`, m);
  return data;
}

export async function deleteMember(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("members").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.members, id);
    return;
  }
  await client.delete(`/api/members/${id}`);
}
