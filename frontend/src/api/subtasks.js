import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listSubtasks(eventId = null) {
  if (SUPABASE_MODE) {
    let query = supabase.from("subtasks").select("*").order("created_at");
    if (eventId != null) query = query.eq("event_id", eventId);
    return orThrow(await query);
  }
  if (LOCAL_MODE) {
    const rows = store.list(KEYS.subtasks);
    return eventId != null ? rows.filter((s) => s.event_id === eventId) : rows;
  }
  const { data } = await client.get("/api/subtasks", {
    params: eventId != null ? { event_id: eventId } : {},
  });
  return data;
}

export async function createSubtask(eventId, title) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase
        .from("subtasks")
        .insert({ event_id: eventId, title, done: false })
        .select()
        .single()
    );
  }
  if (LOCAL_MODE) {
    return store.insert(KEYS.subtasks, { event_id: eventId, title, done: false });
  }
  const { data } = await client.post("/api/subtasks", { event_id: eventId, title });
  return data;
}

export async function updateSubtask(id, patch) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase.from("subtasks").update(patch).eq("id", id).select().single()
    );
  }
  if (LOCAL_MODE) return store.update(KEYS.subtasks, id, patch);
  const { data } = await client.patch(`/api/subtasks/${id}`, patch);
  return data;
}

export async function deleteSubtask(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("subtasks").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.subtasks, id);
    return;
  }
  await client.delete(`/api/subtasks/${id}`);
}
