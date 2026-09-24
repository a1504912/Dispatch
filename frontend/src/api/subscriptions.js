import client from "./client";

export async function listSubscriptions() {
  const { data } = await client.get("/api/subscriptions");
  return data;
}

export async function createSubscription(payload) {
  const { data } = await client.post("/api/subscriptions", payload);
  return data;
}

export async function updateSubscription(id, payload) {
  const { data } = await client.put(`/api/subscriptions/${id}`, payload);
  return data;
}

export async function deleteSubscription(id) {
  await client.delete(`/api/subscriptions/${id}`);
}

export async function chargeSubscriptionNow(id) {
  const { data } = await client.post(`/api/subscriptions/${id}/charge-now`);
  return data;
}

// 從 Gmail 收據偵測訂閱候選
export async function scanGmailSubscriptions() {
  const { data } = await client.post("/api/subscriptions/scan-gmail");
  return data;
}
