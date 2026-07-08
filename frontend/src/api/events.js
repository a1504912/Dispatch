import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

const defaults = {
  description: "",
  agent_id: null,
  color: "#3788d8",
  completed: false,
  all_day: false,
  image: null,
  category_id: null,
  source: "local",
  google_event_id: null,
};

export async function listEvents() {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("events").select("*").order("start_time"));
  }
  if (LOCAL_MODE) return store.list(KEYS.events);
  const { data } = await client.get("/api/events");
  return data;
}

export async function createEvent(event) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase.from("events").insert({ ...defaults, ...event }).select().single()
    );
  }
  if (LOCAL_MODE) return store.insert(KEYS.events, { ...defaults, ...event });
  const { data } = await client.post("/api/events", event);
  return data;
}

export async function updateEvent(id, event) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase.from("events").update(event).eq("id", id).select().single()
    );
  }
  if (LOCAL_MODE) return store.update(KEYS.events, id, event);
  const { data } = await client.put(`/api/events/${id}`, event);
  return data;
}

export async function setEventCompleted(id, completed) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase.from("events").update({ completed }).eq("id", id).select().single()
    );
  }
  if (LOCAL_MODE) return store.update(KEYS.events, id, { completed });
  const { data } = await client.patch(`/api/events/${id}/completed`, { completed });
  return data;
}

export async function deleteEvent(id) {
  if (SUPABASE_MODE) {
    // subtasks 由資料庫的 on delete cascade 一併清除
    orThrow(await supabase.from("events").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.events, id);
    store.removeWhere(KEYS.subtasks, (s) => s.event_id === id);
    return;
  }
  await client.delete(`/api/events/${id}`);
}
