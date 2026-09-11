import client from "./client";

export async function getNews(topic = "top") {
  const { data } = await client.get("/api/news", { params: { topic } });
  return data; // { items: [{title, link, source, published}] }
}
