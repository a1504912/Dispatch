import client from "./client";

export async function getPortfolio() {
  const { data } = await client.get("/api/invest/portfolio");
  return data;
}

export async function getQuotes(codes) {
  const { data } = await client.get("/api/invest/quote", { params: { codes: codes.join(",") } });
  return data; // { 代號: { name, price, change, change_pct, ... } }
}

export async function saveTrade(trade) {
  const { id, ...body } = trade;
  const { data } = id
    ? await client.put(`/api/invest/trades/${id}`, body)
    : await client.post("/api/invest/trades", body);
  return data;
}

export async function deleteTrade(id) {
  await client.delete(`/api/invest/trades/${id}`);
}

export async function saveDividend(div) {
  const { id, ...body } = div;
  const { data } = id
    ? await client.put(`/api/invest/dividends/${id}`, body)
    : await client.post("/api/invest/dividends", body);
  return data;
}

export async function deleteDividend(id) {
  await client.delete(`/api/invest/dividends/${id}`);
}

export async function saveInvestSettings(body) {
  const { data } = await client.put("/api/invest/settings", body);
  return data;
}

export async function setupInvestAccount() {
  const { data } = await client.post("/api/invest/setup-account");
  return data;
}

export async function setManualPrice(code, price) {
  await client.put("/api/invest/manual-price", { code, price });
}

// 台股費用：手續費 0.1425% × 折數（無條件捨去，有最低額）；證交稅 股票 0.3%、ETF 0.1%、債券 ETF 免稅
export function calcFees({ side, code, shares, price }, cfg) {
  const amount = Number(shares) * Number(price);
  if (!amount) return { fee: 0, tax: 0, amount: 0 };
  const odd = Number(shares) < 1000 || Number(shares) % 1000 !== 0;
  const minFee = odd ? cfg?.min_fee_odd ?? 1 : cfg?.min_fee ?? 20;
  const fee = Math.max(Math.floor(amount * 0.001425 * (cfg?.fee_discount ?? 1)), minFee);
  let tax = 0;
  if (side === "sell") {
    const c = String(code || "").toUpperCase();
    const rate = /^00\d+B$/.test(c) ? 0 : c.startsWith("00") ? 0.001 : 0.003;
    tax = Math.floor(amount * rate);
  }
  return { fee, tax, amount };
}
