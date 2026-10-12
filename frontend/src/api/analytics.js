import client from "./client";

export async function getSummary(days = null) {
  const { data } = await client.get("/api/analytics/summary", {
    params: days ? { days } : {},
  });
  return data;
}
