import client from "./client";

export async function listEvents() {
  const { data } = await client.get("/api/events");
  return data;
}

export async function createEvent(event) {
  const { data } = await client.post("/api/events", event);
  return data;
}

export async function updateEvent(id, event) {
  const { data } = await client.put(`/api/events/${id}`, event);
  return data;
}

export async function setEventCompleted(id, completed) {
  const { data } = await client.patch(`/api/events/${id}/completed`, { completed });
  return data;
}

export async function deleteEvent(id) {
  await client.delete(`/api/events/${id}`);
}
