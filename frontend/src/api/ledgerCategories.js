import client from "./client";
import { LOCAL_MODE } from "../localMode";
import { store, KEYS } from "../localStore";
import { SUPABASE_MODE, supabase, orThrow } from "../supabase";

// 預設分類（離線模式種子、也當作 fallback）
export const DEFAULT_LEDGER_CATS = [
  { kind: "expense", name: "餐飲", emoji: "🍜" },
  { kind: "expense", name: "交通", emoji: "🚗" },
  { kind: "expense", name: "購物", emoji: "🛍️" },
  { kind: "expense", name: "娛樂", emoji: "🎮" },
  { kind: "expense", name: "居家", emoji: "🏠" },
  { kind: "expense", name: "醫療", emoji: "💊" },
  { kind: "expense", name: "學習", emoji: "📚" },
  { kind: "expense", name: "人情", emoji: "🎁" },
  { kind: "expense", name: "訂閱", emoji: "💳" },
  { kind: "expense", name: "其他", emoji: "📦" },
  { kind: "income", name: "薪水", emoji: "💰" },
  { kind: "income", name: "獎金", emoji: "🎉" },
  { kind: "income", name: "投資", emoji: "📈" },
  { kind: "income", name: "退款", emoji: "↩️" },
  { kind: "income", name: "其他", emoji: "💵" },
];

function seedLocalIfEmpty() {
  const rows = store.list(KEYS.ledgerCats);
  if (rows.length > 0) return rows;
  DEFAULT_LEDGER_CATS.forEach((c, i) => store.insert(KEYS.ledgerCats, { ...c, sort: i }));
  return store.list(KEYS.ledgerCats);
}

export async function listLedgerCategories() {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("ledger_categories").select("*").order("sort"));
  }
  if (LOCAL_MODE) return seedLocalIfEmpty();
  const { data } = await client.get("/api/ledger-categories");
  return data;
}

export async function createLedgerCategory(cat) {
  if (SUPABASE_MODE) {
    return orThrow(await supabase.from("ledger_categories").insert(cat).select().single());
  }
  if (LOCAL_MODE) return store.insert(KEYS.ledgerCats, cat);
  const { data } = await client.post("/api/ledger-categories", cat);
  return data;
}

export async function updateLedgerCategory(id, cat) {
  if (SUPABASE_MODE) {
    return orThrow(
      await supabase.from("ledger_categories").update(cat).eq("id", id).select().single()
    );
  }
  if (LOCAL_MODE) return store.update(KEYS.ledgerCats, id, cat);
  const { data } = await client.put(`/api/ledger-categories/${id}`, cat);
  return data;
}

export async function deleteLedgerCategory(id) {
  if (SUPABASE_MODE) {
    orThrow(await supabase.from("ledger_categories").delete().eq("id", id));
    return;
  }
  if (LOCAL_MODE) {
    store.remove(KEYS.ledgerCats, id);
    return;
  }
  await client.delete(`/api/ledger-categories/${id}`);
}
