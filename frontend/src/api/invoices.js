import client from "./client";

// 發票功能需要後端打財政部 API，離線／Supabase 模式不支援（呼叫端會先判斷 NO_BACKEND）。

export async function listInvoices({ month, day } = {}) {
  const { data } = await client.get("/api/invoices", { params: { month, day } });
  return data;
}

export async function syncInvoices(days = 60) {
  const { data } = await client.post("/api/invoices/sync", { days });
  return data;
}

export async function getInvoiceSettings() {
  const { data } = await client.get("/api/invoices/settings");
  return data;
}

export async function saveInvoiceSettings(payload) {
  const { data } = await client.put("/api/invoices/settings", payload);
  return data;
}

export async function invoiceToTransaction(id, body = {}) {
  const { data } = await client.post(`/api/invoices/${id}/to-transaction`, body);
  return data;
}
