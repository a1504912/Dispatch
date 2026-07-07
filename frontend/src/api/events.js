import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";

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
  if (LOCAL_MODE) return store.list(KEYS.events);
  const { data } = await client.get("/api/events");
  return data;
}

export async function createEvent(event) {
  if (LOCAL_MODE) return store.insert(KEYS.events, { ...defaults, ...event });
  const { data } = await client.post("/api/events", event);
  return data;
}

export async function updateEvent(id, event) {
  if (LOCAL_MODE) return store.update(KEYS.events, id, event);
  const { data } = await client.put(`/api/events/${id}`, event);
  return data;
}

export async function setEventCompleted(id, completed) {
  if (LOCAL_MODE) return store.update(KEYS.events, id, { completed });
  const { data } = await client.patch(`/api/events/${id}/completed`, { completed });
  return data;
}

export async function deleteEvent(id) {
  if (LOCAL_MODE) {
    store.remove(KEYS.events, id);
    store.removeWhere(KEYS.subtasks, (s) => s.event_id === id);
    return;
  }
  await client.delete(`/api/events/${id}`);
}
