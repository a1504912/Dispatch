import client from "./client";

// 發票功能需要後端開瀏覽器登入財政部平台，離線／Supabase 模式不支援。

export async function listInvoices({ month, day } = {}) {
  const { data } = await client.get("/api/invoices", { params: { month, day } });
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

// 開始登入：回 { sid, captcha_image }
export async function invoiceLoginStart() {
  const { data } = await client.post("/api/invoices/login/start");
  return data;
}

// 送出驗證碼並抓發票：回 { added, fetched, total_pages }
export async function invoiceLoginSubmit(sid, captcha) {
  const { data } = await client.post("/api/invoices/login/submit", { sid, captcha });
  return data;
}

export async function invoiceToTransaction(id, body = {}) {
  const { data } = await client.post(`/api/invoices/${id}/to-transaction`, body);
  return data;
}

// 綁定發票到使用者自己在編輯視窗建立的那筆記錄
export async function invoiceLink(id, transaction_id) {
  const { data } = await client.post(`/api/invoices/${id}/link`, { transaction_id });
  return data;
}
