// 信用卡帳單預估：依「結帳日／繳款日」把刷卡分到各期帳單，分期的拆成每月一期。
//
// - 結帳日 closeDay：0＝月底（整個月份是一期）；15＝每月 15 日結帳（16 日起算下一期）
// - 繳款日 dueDay：0＝沒設定（就當結帳隔月要繳，只顯示月份）
// - 分期：交易的 amount 是總額，installments＝期數；每期 floor(總額/期數)，零頭放第一期（跟銀行一樣）
// - 算進帳單的：這張卡的支出（退款是負數會扣掉）、收入（退刷／回饋）、從卡片轉出（預借現金）
// - 繳卡費＝轉帳「轉入」這張卡：算成繳掉結帳日在繳款之前、最近那一期

const pad = (n) => String(n).padStart(2, "0");
const dim = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-based
export const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
const keyToYM = (k) => [Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1];
const addMonths = (k, n) => {
  const [y, m] = keyToYM(k);
  const d = new Date(y, m + n, 1);
  return monthKey(d.getFullYear(), d.getMonth());
};
const parseDate = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

// 帳戶本身或所屬類型叫「信用卡」或用 💳，就當信用卡
export function isCardAccount(acc, accounts = []) {
  if (!acc) return false;
  const hit = (a) => a && (a.emoji === "💳" || /信用卡/.test(a.name || ""));
  return hit(acc) || hit(accounts.find((p) => p.id === acc.parent_id));
}

// 可以記帳的信用卡（沒有子帳戶的那一層）
export function cardAccounts(accounts = []) {
  return accounts.filter(
    (a) => isCardAccount(a, accounts) && !accounts.some((x) => x.parent_id === a.id)
  );
}

// 這天的消費落在哪一期（以「結帳月份」當 key）
export function statementKeyOf(dateStr, closeDay) {
  const d = parseDate(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (!closeDay) return monthKey(y, m);
  const c = Math.min(closeDay, dim(y, m));
  return d.getDate() <= c ? monthKey(y, m) : addMonths(monthKey(y, m), 1);
}

export function closeDateOf(key, closeDay) {
  const [y, m] = keyToYM(key);
  return new Date(y, m, closeDay ? Math.min(closeDay, dim(y, m)) : dim(y, m));
}

// 繳款日：結帳日之後第一個「繳款日」；沒設定就回 null（只知道是結帳隔月）
export function dueDateOf(key, closeDay, dueDay) {
  const close = closeDateOf(key, closeDay);
  if (!dueDay) return null;
  let y = close.getFullYear();
  let m = close.getMonth();
  if (!(closeDay && dueDay > close.getDate())) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return new Date(y, m, Math.min(dueDay, dim(y, m)));
}

// 要在哪個月份繳（給「11 月要繳／12 月要繳」用）
export function payMonthOf(key, closeDay, dueDay) {
  const due = dueDateOf(key, closeDay, dueDay);
  return due ? monthKey(due.getFullYear(), due.getMonth()) : addMonths(key, 1);
}

// 分期：每期金額（零頭放第一期）
export function installmentParts(amount, n) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  if (n === 1 || !(amount > 0)) return [amount];
  const per = Math.floor(amount / n);
  return [amount - per * (n - 1), ...Array(n - 1).fill(per)];
}

/**
 * 一張卡的各期帳單。
 * 回傳 [{ key, close, due, payMonth, amount, paid, items: [{ tx, amount, k, n }] }]，依 key 排序。
 */
export function cardStatements(card, txs) {
  const closeDay = Number(card.card_close_day) || 0;
  const dueDay = Number(card.card_due_day) || 0;
  const byKey = {};
  const get = (key) =>
    (byKey[key] ??= {
      key,
      close: closeDateOf(key, closeDay),
      due: dueDateOf(key, closeDay, dueDay),
      payMonth: payMonthOf(key, closeDay, dueDay),
      amount: 0,
      paid: 0,
      items: [],
    });
  const onCard = (t) => t.account_id === card.id || (t.account_id == null && t.account === card.name);
  const payments = [];

  for (const t of txs) {
    if (!t?.date) continue;
    const amt = Number(t.amount) || 0;
    if (t.kind === "transfer") {
      if (t.to_account_id === card.id) payments.push(t);
      else if (t.account_id === card.id) {
        const s = get(statementKeyOf(t.date, closeDay));
        s.amount += amt;
        s.items.push({ tx: t, amount: amt, k: 1, n: 1 });
      }
      continue;
    }
    if (!onCard(t)) continue;
    if (t.kind === "expense") {
      const n = amt > 0 ? Math.max(1, Number(t.installments) || 1) : 1;
      const base = statementKeyOf(t.date, closeDay);
      installmentParts(amt, n).forEach((part, i) => {
        const s = get(addMonths(base, i));
        s.amount += part;
        s.items.push({ tx: t, amount: part, k: i + 1, n });
      });
    } else if (t.kind === "income") {
      const s = get(statementKeyOf(t.date, closeDay));
      s.amount -= amt;
      s.items.push({ tx: t, amount: -amt, k: 1, n: 1 });
    }
  }

  const list = Object.values(byKey).sort((a, b) => a.key.localeCompare(b.key));
  // 繳款：算給「結帳日在繳款日之前」最近、還沒繳清的那一期
  for (const p of payments.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const pd = parseDate(p.date);
    let left = Number(p.amount) || 0;
    const closed = list.filter((s) => s.close < pd).reverse();
    for (const s of closed) {
      if (left <= 0) break;
      const need = Math.max(0, s.amount - s.paid);
      if (need <= 0) continue;
      const use = Math.min(need, left);
      s.paid += use;
      left -= use;
    }
  }
  for (const s of list) {
    s.amount = Math.round(s.amount);
    s.paid = Math.round(s.paid);
  }
  return list;
}

export const fmtMonth = (key) => `${Number(key.slice(5, 7))} 月`;
export const fmtMD = (d) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : "");
export const currentMonthKey = (d = new Date()) => monthKey(d.getFullYear(), d.getMonth());
export { addMonths };
