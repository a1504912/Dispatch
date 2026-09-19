import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

export const DEFAULT_ACCOUNTS = [
  { name: "現金", emoji: "💵", initial: 0 },
  { name: "銀行帳戶", emoji: "🏦", initial: 0 },
  { name: "信用卡", emoji: "💳", initial: 0 },
  { name: "電子支付", emoji: "📱", initial: 0 },
  { name: "外幣", emoji: "💱", initial: 0 },
];

function seedLocalIfEmpty() {
  const rows = store.list(KEYS.accounts);
  if (rows.length > 0) return rows;
  DEFAULT_ACCOUNTS.forEach((a, i) => store.insert(KEYS.accounts, { ...a, sort: i }));
  return store.list(KEYS.accounts);
}

export async function listAccounts() {
  if (SUPABASE_MODE) return orThrow(await supabase.from("accounts").select("*").order("sort"));
  if (LOCAL_MODE) return seedLocalIfEmpty();
  const { data } = await client.get("/api/accounts");
  return data;
}

export async function createAccount(a) {
  if (SUPABASE_MODE) return orThrow(await supabase.from("accounts").insert(a).select().single());
  if (LOCAL_MODE) return store.insert(KEYS.accounts, a);
  const { data } = await client.post("/api/accounts", a);
  return data;
}

export async function updateAccount(id, a) {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("accounts").update(a).eq("id", id).select().single());
  }
  if (LOCAL_MODE) return store.update(KEYS.accounts, id, a);
  const { data } = await client.put(`/api/accounts/${id}`, a);
  return data;
}

export async function deleteAccount(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("accounts").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.accounts, id);
    return;
  }
  await client.delete(`/api/accounts/${id}`);
}
