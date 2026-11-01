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

// 手機通知自動記帳
export const quickSettings = async () => (await client.get("/api/quick-ledger/settings")).data;
export const saveQuickSettings = async (body) => (await client.put("/api/quick-ledger/settings", body)).data;
export const rotateQuickKey = async () => (await client.post("/api/quick-ledger/settings/rotate-key")).data;
export const quickEntries = async () => (await client.get("/api/quick-ledger/entries", { params: { limit: 80 } })).data;
export const confirmQuick = async (id, body) => (await client.post(`/api/quick-ledger/entries/${id}/confirm`, body)).data;
export const undoQuick = async (id) => (await client.post(`/api/quick-ledger/entries/${id}/undo`)).data;
export const dismissQuick = async (id) => client.delete(`/api/quick-ledger/entries/${id}`);
// 測試用：跟手機一樣用金鑰呼叫 hook
export const sendQuickTest = async (key, body) =>
  (await client.post("/api/quick-ledger/hook", body, { headers: { "X-Api-Key": key } })).data;
