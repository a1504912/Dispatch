import client from "./client";

export async function listSubtasks(eventId = null) {
  const { data } = await client.get("/api/subtasks", {
    params: eventId != null ? { event_id: eventId } : {},
  });
  return data;
}

export async function createSubtask(eventId, title) {
  const { data } = await client.post("/api/subtasks", { event_id: eventId, title });
  return data;
}

export async function updateSubtask(id, patch) {
  const { data } = await client.patch(`/api/subtasks/${id}`, patch);
  return data;
}

export async function deleteSubtask(id) {
  await client.delete(`/api/subtasks/${id}`);
}
