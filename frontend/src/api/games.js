import client from "./client";

export async function getGames() {
  const { data } = await client.get("/api/games");
  return data; // { games: [...] }
}
