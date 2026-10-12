import client from "./client";

// mode: draft | titles | hashtags | polish | ideas
export async function assist(payload) {
  const { data } = await client.post("/api/content/assist", payload, {
    timeout: 130000,
  });
  return data;
}
