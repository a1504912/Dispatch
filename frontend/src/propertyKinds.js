// 身家財產：各類別的欄位樣板、常用日期、顯示方式

export const REPEATS = [
  ["none", "不重複"],
  ["monthly", "每月"],
  ["quarterly", "每季"],
  ["halfyear", "每半年"],
  ["yearly", "每年"],
  ["2years", "每兩年"],
];
export const REPEAT_MONTHS = { none: 0, monthly: 1, quarterly: 3, halfyear: 6, yearly: 12, "2years": 24 };
export const REMIND_OPTIONS = [
  [-1, "不提醒"],
  [0, "當天"],
  [3, "前 3 天"],
  [7, "前 7 天"],
  [14, "前 14 天"],
  [30, "前 30 天"],
  [60, "前 60 天"],
  [90, "前 90 天"],
];
export const STATUSES = [
  ["active", "使用中／有效"],
  ["sold", "已出售"],
  ["cancelled", "已解約／停保"],
  ["scrapped", "已報廢"],
  ["ended", "已結束"],
];
const PAY_FREQ = ["年繳", "半年繳", "季繳", "月繳", "躉繳"];
const FREQ_REPEAT = { 年繳: "yearly", 半年繳: "halfyear", 季繳: "quarterly", 月繳: "monthly", 躉繳: "none" };
const FREQ_TIMES = { 年繳: 1, 半年繳: 2, 季繳: 4, 月繳: 12, 躉繳: 0 };

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => iso(new Date());

export function addMonthsISO(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  return iso(t);
}
// 從某天開始每 N 個月一次，找今天（含）之後的下一次
export function nextFrom(startISO, months) {
  if (!startISO || !months) return "";
  let d = startISO;
  const today = todayISO();
  for (let i = 0; d < today && i < 1200; i++) d = addMonthsISO(startISO, months * (i + 1));
  return d;
}
// 每年固定月日（例：牌照稅 04-30）的下一次
export function nextMonthDay(md) {
  const t = new Date();
  const thisYear = `${t.getFullYear()}-${md}`;
  return thisYear >= todayISO() ? thisYear : `${t.getFullYear() + 1}-${md}`;
}

let seq = 0;
export const newDateId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* quick：建立／編輯時可以一鍵加的日期
   make(form, defaultDays) → {label, date, repeat, remind_days}；auto：新增這類時預先放好 */
const fixedYearly = (label, md, auto = false) => ({
  label,
  auto,
  make: (_f, days) => ({ label, date: nextMonthDay(md), repeat: "yearly", remind_days: days }),
});
const blank = (label, repeat = "yearly", auto = false) => ({
  label,
  auto,
  make: (_f, days) => ({ label, date: "", repeat, remind_days: days }),
});
const warranty = (years) => ({
  label: `保固 ${years} 年`,
  make: (f, days) => ({
    label: "保固到期",
    date: f.purchase_date ? addMonthsISO(f.purchase_date, years * 12) : "",
    repeat: "none",
    remind_days: days,
  }),
});

export const KINDS = [
  {
    key: "insurance",
    label: "保險",
    emoji: "🛡️",
    tint: "bg-indigo-50 text-indigo-600",
    nameHint: "保單／商品名稱，例：國泰真全意住院醫療",
    purchaseLabel: "生效日",
    showPrice: false,
    fields: [
      { key: "company", label: "保險公司" },
      { key: "policy_no", label: "保單號碼" },
      { key: "ins_type", label: "險種", type: "select", options: ["醫療險", "壽險", "意外險", "癌症險", "重大傷病", "長照／失能", "儲蓄／年金", "投資型", "車險", "住宅火險／地震險", "旅平險", "其他"] },
      { key: "insured", label: "被保險人" },
      { key: "holder", label: "要保人" },
      { key: "beneficiary", label: "受益人" },
      { key: "premium", label: "保費（每期）", type: "money" },
      { key: "pay_freq", label: "繳費方式", type: "select", options: PAY_FREQ },
      { key: "pay_years", label: "繳費年期", placeholder: "例：20 年" },
      { key: "end_date", label: "保障到期日", type: "date" },
      { key: "coverage", label: "保障內容／保額", type: "textarea", placeholder: "例：住院日額 2,000、手術 1,000 倍…", wide: true },
      { key: "agent", label: "業務員／電話" },
      { key: "claim_phone", label: "理賠／客服電話" },
    ],
    quick: [
      {
        label: "下次繳費",
        auto: true,
        make: (f, days) => {
          const repeat = FREQ_REPEAT[f.fields?.pay_freq] || "yearly";
          return { label: "下次繳費", date: nextFrom(f.purchase_date, REPEAT_MONTHS[repeat]), repeat, remind_days: Math.min(days, 14) };
        },
      },
      {
        label: "保障到期",
        make: (f, days) => ({ label: "保障到期", date: f.fields?.end_date || "", repeat: "none", remind_days: Math.max(days, 60) }),
      },
    ],
    subtitle: (it) => [it.fields.company, it.fields.ins_type].filter(Boolean).join("・"),
  },
  {
    key: "car",
    label: "汽車",
    emoji: "🚗",
    tint: "bg-sky-50 text-sky-600",
    nameHint: "例：我的 Altis",
    purchaseLabel: "購買日期",
    showPrice: true,
    fields: [
      { key: "brand_model", label: "廠牌型號", placeholder: "例：Toyota Corolla Altis 1.8" },
      { key: "plate", label: "車牌" },
      { key: "made", label: "出廠年月", placeholder: "例：2021/05" },
      { key: "cc", label: "排氣量", placeholder: "例：1798cc" },
      { key: "mileage", label: "目前里程", placeholder: "例：35,000 km" },
      { key: "vin", label: "車身號碼" },
      { key: "dealer", label: "購買車行／業務" },
      { key: "insurer", label: "車險公司／保單" },
    ],
    quick: [
      fixedYearly("牌照稅（4/1–4/30）", "04-30", true),
      fixedYearly("燃料費（7/1–7/31）", "07-31", true),
      blank("強制險到期", "yearly", true),
      blank("任意險到期"),
      blank("定期保養", "halfyear"),
      blank("定期驗車"),
    ],
    subtitle: (it) => [it.fields.brand_model, it.fields.plate].filter(Boolean).join("・"),
  },
  {
    key: "motorcycle",
    label: "機車",
    emoji: "🛵",
    tint: "bg-teal-50 text-teal-600",
    nameHint: "例：勁戰六代",
    purchaseLabel: "購買日期",
    showPrice: true,
    fields: [
      { key: "brand_model", label: "廠牌型號", placeholder: "例：YAMAHA 勁戰六代 125" },
      { key: "plate", label: "車牌" },
      { key: "made", label: "出廠年月" },
      { key: "cc", label: "排氣量" },
      { key: "mileage", label: "目前里程" },
      { key: "dealer", label: "購買車行" },
    ],
    quick: [
      blank("強制險到期", "yearly", true),
      blank("排氣定檢"),
      blank("定期保養", "halfyear"),
      fixedYearly("牌照稅（150cc 以上，4/1–4/30）", "04-30"),
      blank("燃料費"),
    ],
    subtitle: (it) => [it.fields.brand_model, it.fields.plate].filter(Boolean).join("・"),
  },
  {
    key: "valuable",
    label: "貴重物品",
    emoji: "💎",
    tint: "bg-amber-50 text-amber-600",
    nameHint: "例：勞力士 Submariner、金飾、名牌包",
    purchaseLabel: "購買日期",
    showPrice: true,
    fields: [
      { key: "brand", label: "品牌" },
      { key: "model", label: "型號／款式" },
      { key: "serial", label: "序號／證書編號" },
      { key: "store", label: "購買地點" },
      { key: "location", label: "存放位置" },
      { key: "spec", label: "規格／材質", placeholder: "例：18K、1 克拉、40mm" },
    ],
    quick: [warranty(1), warranty(2), warranty(5), blank("定期保養")],
    subtitle: (it) => [it.fields.brand, it.fields.model].filter(Boolean).join(" "),
  },
  {
    key: "electronics",
    label: "3C 家電",
    emoji: "📱",
    tint: "bg-violet-50 text-violet-600",
    nameHint: "例：MacBook Pro 14、冷氣、洗衣機",
    purchaseLabel: "購買日期",
    showPrice: true,
    fields: [
      { key: "brand", label: "品牌" },
      { key: "model", label: "型號" },
      { key: "serial", label: "序號" },
      { key: "store", label: "購買店家" },
      { key: "invoice_no", label: "發票號碼" },
      { key: "location", label: "放置位置" },
    ],
    quick: [warranty(1), warranty(2), warranty(3), blank("延長保固到期", "none")],
    subtitle: (it) => [it.fields.brand, it.fields.model].filter(Boolean).join(" "),
  },
  {
    key: "house",
    label: "房產",
    emoji: "🏠",
    tint: "bg-rose-50 text-rose-600",
    nameHint: "例：台中自住",
    purchaseLabel: "購買日期",
    showPrice: true,
    fields: [
      { key: "address", label: "地址", wide: true },
      { key: "area", label: "坪數" },
      { key: "owner", label: "所有權人" },
      { key: "loan_bank", label: "房貸銀行" },
      { key: "loan", label: "房貸金額／利率" },
      { key: "loan_end", label: "房貸到期日", type: "date" },
    ],
    quick: [
      fixedYearly("房屋稅（5/1–5/31）", "05-31", true),
      fixedYearly("地價稅（11/1–11/30）", "11-30", true),
      blank("住宅火險／地震險到期"),
      blank("房貸繳款", "monthly"),
    ],
    subtitle: (it) => it.fields.address || "",
  },
  {
    key: "other",
    label: "其他",
    emoji: "📦",
    tint: "bg-slate-100 text-slate-600",
    nameHint: "名稱",
    purchaseLabel: "購買日期",
    showPrice: true,
    fields: [
      { key: "brand", label: "品牌" },
      { key: "model", label: "型號" },
      { key: "serial", label: "序號" },
      { key: "store", label: "購買地點" },
      { key: "location", label: "存放位置" },
    ],
    quick: [warranty(1), warranty(2), blank("到期日", "none")],
    subtitle: (it) => [it.fields.brand, it.fields.model].filter(Boolean).join(" "),
  },
];
export const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));

// 保費換算成一年
export function yearlyPremium(it) {
  if (it.kind !== "insurance") return 0;
  const p = Number(String(it.fields?.premium || "").replace(/[^\d.]/g, "")) || 0;
  const times = FREQ_TIMES[it.fields?.pay_freq] ?? 1;
  return p * times;
}
export const valueOf = (it) => (it.kind === "insurance" ? 0 : it.current_value ?? it.purchase_price ?? 0);
export const FREQ_REPEAT_MAP = FREQ_REPEAT;
