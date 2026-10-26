import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export async function listTransactions() {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("transactions").select("*").order("date", { ascending: false }));
  }
  if (LOCAL_MODE) return store.list(KEYS.transactions);
  const { data } = await client.get("/api/transactions");
  return data;
}

export async function createTransaction(tx) {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("transactions").insert(tx).select().single());
  }
  if (LOCAL_MODE) return store.insert(KEYS.transactions, tx);
  const { data } = await client.post("/api/transactions", tx);
  return data;
}

export async function updateTransaction(id, tx) {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("transactions").update(tx).eq("id", id).select().single());
  }
  if (LOCAL_MODE) return store.update(KEYS.transactions, id, tx);
  const { data } = await client.put(`/api/transactions/${id}`, tx);
  return data;
}

export async function deleteTransaction(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("transactions").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.transactions, id);
    return;
  }
  await client.delete(`/api/transactions/${id}`);
}

// AI 記帳：截圖或打字 → 建議的記錄（還沒存）；provider：gpt / claude
export async function ledgerFromImage(file, provider = "gpt", hint = "") {
  const fd = new FormData();
  fd.append("file", file, file.name || "image.png");
  fd.append("provider", provider);
  if (hint) fd.append("hint", hint);
  const { data } = await client.post("/api/ledger-ai/from-image", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600000,
  });
  return data.items || [];
}
export async function ledgerFromText(text, provider = "gpt") {
  const { data } = await client.post("/api/ledger-ai/from-text", { text, provider }, { timeout: 600000 });
  return data.items || [];
}
