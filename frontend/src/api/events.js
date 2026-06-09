import client from "./client";

export async function listEvents() {
  const { data } = await client.get("/api/events");
  return data;
}

export async function createEvent(event) {
  const { data } = await client.post("/api/events", event);
  return data;
}

export async function deleteEvent(id) {
  await client.delete(`/api/events/${id}`);
}
