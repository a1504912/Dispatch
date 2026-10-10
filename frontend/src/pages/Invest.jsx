import { useEffect, useMemo, useRef, useState } from "react";
import { listAccounts } from "../api/accounts";
import {
  calcFees,
  deleteDividend,
  deleteTrade,
  getPortfolio,
  getQuotes,
  saveDividend,
  saveInvestSettings,
  saveTrade,
  setManualPrice,
  setupInvestAccount,
} from "../api/invest";

const field =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";
const money = (n) => (n == null ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"));
const signed = (n) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US"));
const pct = (n) => (n == null ? "" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
// 台股慣例：漲紅跌綠
const tone = (n) => (n > 0 ? "text-rose-600" : n < 0 ? "text-emerald-600" : "text-slate-500");
const price2 = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
function fmtShares(n) {
  n = Number(n) || 0;
  const lots = Math.floor(n / 1000);
  const odd = Math.round(n - lots * 1000);
  if (lots && !odd) return `${lots} 張`;
  if (lots) return `${lots} 張 ${odd} 股`;
  return `${odd.toLocaleString()} 股`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const errMsg = (e) => e?.response?.data?.detail || e?.message || "失敗";

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function Label({ children, hint }) {
  return (
    <label className="mb-1 flex items-baseline justify-between text-xs font-semibold text-slate-500">
      <span>{children}</span>
      {hint && <span className="font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

/* 輸入代號時自動查名稱和現價 */
function useCodeLookup(code) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = (code || "").trim().toUpperCase();
    setInfo(null);
    if (!/^[0-9A-Z]{4,6}$/.test(c)) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      getQuotes([c])
        .then((q) => alive && setInfo(q[c] || { missing: true }))
        .catch(() => alive && setInfo({ missing: true }))
        .finally(() => alive && setBusy(false));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
      setBusy(false);
    };
  }, [code]);
  return [info, busy];
}

function AccountSelect({ value, onChange, accounts, exclude }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={field}>
      <option value="">（不指定）</option>
      {accounts.filter((a) => a.id !== exclude).map((a) => (
        <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
      ))}
    </select>
  );
}

/* ---------- 買進 / 賣出 ---------- */
function TradeModal({ initial, holdings, settings, accounts, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [f, setF] = useState(() => ({
    side: initial?.side || "buy",
    date: initial?.date || todayStr(),
    code: initial?.code || "",
    name: initial?.name || "",
    qty: initial?.shares ? (initial.shares % 1000 === 0 ? initial.shares / 1000 : initial.shares) : "",
    unit: initial?.shares ? (initial.shares % 1000 === 0 ? "lot" : "share") : "lot",
    price: initial?.price ?? "",
    fee: initial?.fee ?? "",
    tax: initial?.tax ?? "",
    cash_account_id: initial?.cash_account_id ?? settings.cash_account_id ?? null,
    ledger: initial?.ledger ?? true,
    note: initial?.note || "",
  }));
  const [autoFee, setAutoFee] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [info, busy] = useCodeLookup(f.code);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const shares = (Number(f.qty) || 0) * (f.unit === "lot" ? 1000 : 1);
  const code = f.code.trim().toUpperCase();
  const held = holdings.find((h) => h.code === code);

  // 查到名稱就帶入；價格還沒填就帶現價
  useEffect(() => {
    if (info && !info.missing) {
      setF((x) => ({ ...x, name: x.name && x.code === initial?.code ? x.name : info.name || x.name, price: x.price === "" ? info.price : x.price }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const auto = calcFees({ side: f.side, code, shares, price: f.price }, settings);
  useEffect(() => {
    if (autoFee) setF((x) => ({ ...x, fee: auto.amount ? auto.fee : "", tax: auto.amount && f.side === "sell" ? auto.tax : "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFee, auto.fee, auto.tax, auto.amount, f.side]);

  const fee = Number(f.fee) || 0;
  const tax = f.side === "sell" ? Number(f.tax) || 0 : 0;
  const amount = shares * (Number(f.price) || 0);
  const total = f.side === "buy" ? amount + fee : amount - fee - tax;
  const estPL = f.side === "sell" && held && !isEdit ? total - (held.cost / held.shares) * shares : null;
  const ledgerReady = Boolean(settings.account_id);
  const canSave = code && shares > 0 && Number(f.price) > 0 && !saving;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      await saveTrade({
        id: initial?.id,
        side: f.side,
        date: f.date,
        code,
        name: f.name.trim(),
        shares,
        price: Number(f.price),
        fee,
        tax,
        cash_account_id: f.cash_account_id,
        ledger: f.ledger,
        note: f.note,
      });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("刪除這筆交易？（自動產生的記帳也會一起刪掉）")) return;
    try {
      await deleteTrade(initial.id);
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <Modal
      title={isEdit ? "編輯交易" : f.side === "buy" ? "買進" : "賣出"}
      onClose={onClose}
      footer={
        <>
          {isEdit && <button onClick={remove} className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50">刪除</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button>
          <button disabled={!canSave} onClick={submit} className={`rounded-xl px-5 py-2 text-sm font-bold text-white shadow disabled:opacity-40 ${f.side === "buy" ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {[["buy", "買進", "bg-rose-500"], ["sell", "賣出", "bg-emerald-600"]].map(([k, label, bg]) => (
          <button key={k} onClick={() => set({ side: k })} className={`rounded-lg py-1.5 text-sm font-bold transition ${f.side === k ? `${bg} text-white shadow` : "text-slate-500"}`}>{label}</button>
        ))}
      </div>

      {f.side === "sell" && !isEdit && holdings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {holdings.map((h) => (
            <button key={h.code} onClick={() => set({ code: h.code, name: h.name, price: h.price ?? "" })}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${code === h.code ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-indigo-300"}`}>
              {h.code} {h.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>日期</Label>
          <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} className={field} />
        </div>
        <div>
          <Label hint={busy ? "查詢中…" : ""}>股票代號</Label>
          <input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase(), name: "" })} placeholder="2330、0050" className={`${field} font-mono uppercase`} autoFocus={!isEdit} />
        </div>
      </div>
      {code && (
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {info && !info.missing ? (
            <span>
              <b className="text-slate-800">{info.name}</b> 現價 <b>{price2(info.price)}</b>{" "}
              <span className={tone(info.change)}>{pct(info.change_pct)}</span>
              <span className="text-slate-400">（{info.source}{info.market ? `・${info.market}` : ""}）</span>
            </span>
          ) : info?.missing ? (
            <span className="text-amber-600">查不到報價（代號錯誤或報價暫時抓不到），名稱和價格請自己填</span>
          ) : (
            <span className="text-slate-400">查詢中…</span>
          )}
          {held && <span className="ml-2 text-slate-500">｜持有 {fmtShares(held.shares)}，均價 {price2(held.avg)}</span>}
        </div>
      )}
      <div>
        <Label>名稱</Label>
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="自動帶入" className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label hint={shares ? `= ${shares.toLocaleString()} 股` : ""}>數量</Label>
          <div className="flex gap-1">
            <input type="number" inputMode="decimal" min="0" value={f.qty} onChange={(e) => set({ qty: e.target.value })} className={field} />
            <select value={f.unit} onChange={(e) => set({ unit: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm">
              <option value="lot">張</option>
              <option value="share">股</option>
            </select>
          </div>
        </div>
        <div>
          <Label>成交價</Label>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={f.price} onChange={(e) => set({ price: e.target.value })} className={field} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label hint={autoFee ? "自動" : ""}>手續費</Label>
          <input type="number" inputMode="decimal" min="0" value={f.fee} onChange={(e) => { setAutoFee(false); set({ fee: e.target.value }); }} className={field} />
        </div>
        {f.side === "sell" ? (
          <div>
            <Label hint={autoFee ? "自動" : ""}>證交稅</Label>
            <input type="number" inputMode="decimal" min="0" value={f.tax} onChange={(e) => { setAutoFee(false); set({ tax: e.target.value }); }} className={field} />
          </div>
        ) : (
          <div className="flex items-end">
            {!autoFee && (
              <button onClick={() => setAutoFee(true)} className="mb-2 text-xs font-semibold text-indigo-600 hover:underline">↺ 重新自動計算</button>
            )}
          </div>
        )}
      </div>
      {f.side === "sell" && !autoFee && (
        <button onClick={() => setAutoFee(true)} className="text-xs font-semibold text-indigo-600 hover:underline">↺ 重新自動計算手續費和稅</button>
      )}

      <div className={`rounded-xl px-4 py-3 ${f.side === "buy" ? "bg-rose-50" : "bg-emerald-50"}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-600">{f.side === "buy" ? "應付金額" : "實收金額"}</span>
          <span className="text-xl font-black text-slate-900">{money(total)}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          成交 {money(amount)} {f.side === "buy" ? "+" : "-"} 手續費 {money(fee)}{f.side === "sell" ? ` - 證交稅 ${money(tax)}` : ""}
        </p>
        {estPL != null && (
          <p className="mt-1 text-xs font-semibold">
            預估已實現損益 <span className={tone(estPL)}>{signed(estPL)}</span>
          </p>
        )}
      </div>

      <div>
        <Label>交割帳戶</Label>
        <AccountSelect value={f.cash_account_id} onChange={(v) => set({ cash_account_id: v })} accounts={accounts} exclude={settings.account_id} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={f.ledger} onChange={(e) => set({ ledger: e.target.checked })} className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span>
          同步到記帳（記成轉帳{f.side === "sell" ? "＋投資損益" : ""}，不算支出）
          {!ledgerReady && <span className="block text-xs text-amber-600">還沒設定證券帳戶，到 ⚙ 設定按一下就好</span>}
          {ledgerReady && !f.cash_account_id && <span className="block text-xs text-amber-600">要選交割帳戶才會同步</span>}
        </span>
      </label>
      <div>
        <Label>備註</Label>
        <input value={f.note} onChange={(e) => set({ note: e.target.value })} className={field} />
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 股利 ---------- */
function DividendModal({ initial, holdings, settings, accounts, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [f, setF] = useState(() => ({
    date: initial?.date || todayStr(),
    code: initial?.code || "",
    name: initial?.name || "",
    cash: initial?.cash || "",
    stock_shares: initial?.stock_shares || "",
    cash_account_id: initial?.cash_account_id ?? settings.cash_account_id ?? null,
    ledger: initial?.ledger ?? true,
    note: initial?.note || "",
  }));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [info] = useCodeLookup(f.code);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => {
    if (info?.name && !f.name) set({ name: info.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);
  const code = f.code.trim().toUpperCase();
  const canSave = code && (Number(f.cash) > 0 || Number(f.stock_shares) > 0) && !saving;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      await saveDividend({ ...f, id: initial?.id, code, cash: Number(f.cash) || 0, stock_shares: Number(f.stock_shares) || 0 });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("刪除這筆股利？")) return;
    try {
      await deleteDividend(initial.id);
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      title={isEdit ? "編輯股利" : "記錄股利"}
      onClose={onClose}
      footer={
        <>
          {isEdit && <button onClick={remove} className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50">刪除</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button>
          <button disabled={!canSave} onClick={submit} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white shadow hover:bg-amber-600 disabled:opacity-40">{saving ? "儲存中…" : "儲存"}</button>
        </>
      }
    >
      {!isEdit && holdings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {holdings.map((h) => (
            <button key={h.code} onClick={() => set({ code: h.code, name: h.name })}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${code === h.code ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200 hover:ring-indigo-300"}`}>
              {h.code} {h.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>入帳日</Label>
          <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} className={field} />
        </div>
        <div>
          <Label>股票代號</Label>
          <input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase(), name: "" })} className={`${field} font-mono uppercase`} />
        </div>
      </div>
      <div>
        <Label>名稱</Label>
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="自動帶入" className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label hint="實際入帳">現金股利</Label>
          <input type="number" inputMode="decimal" min="0" value={f.cash} onChange={(e) => set({ cash: e.target.value })} className={field} />
        </div>
        <div>
          <Label hint="股數">股票股利（配股）</Label>
          <input type="number" inputMode="decimal" min="0" value={f.stock_shares} onChange={(e) => set({ stock_shares: e.target.value })} className={field} />
        </div>
      </div>
      <div>
        <Label>入帳帳戶</Label>
        <AccountSelect value={f.cash_account_id} onChange={(v) => set({ cash_account_id: v })} accounts={accounts} exclude={settings.account_id} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={f.ledger} onChange={(e) => set({ ledger: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
        現金股利同步到記帳（收入「股利」）
      </label>
      <div>
        <Label>備註</Label>
        <input value={f.note} onChange={(e) => set({ note: e.target.value })} className={field} />
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 設定 ---------- */
function SettingsModal({ settings, accounts, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    account_id: settings.account_id,
    cash_account_id: settings.cash_account_id,
    discount: +(settings.fee_discount * 10).toFixed(2),
    min_fee: settings.min_fee,
    min_fee_odd: settings.min_fee_odd,
  }));
  const [err, setErr] = useState("");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  async function createAccount() {
    try {
      const { account_id } = await setupInvestAccount();
      set({ account_id });
      onSaved(false);
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function submit() {
    setErr("");
    try {
      await saveInvestSettings({
        account_id: f.account_id,
        cash_account_id: f.cash_account_id,
        fee_discount: Number(f.discount) / 10,
        min_fee: Number(f.min_fee),
        min_fee_odd: Number(f.min_fee_odd),
      });
      onSaved(true);
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      title="投資設定"
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button>
          <button onClick={submit} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700">儲存</button>
        </>
      }
    >
      <div>
        <Label hint="餘額 = 持股成本">證券帳戶（記帳用）</Label>
        <div className="flex gap-2">
          <AccountSelect value={f.account_id} onChange={(v) => set({ account_id: v })} accounts={accounts} />
          {!accounts.some((a) => a.name === "證券帳戶") && (
            <button onClick={createAccount} className="shrink-0 rounded-xl bg-indigo-50 px-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-100">＋ 建立</button>
          )}
        </div>
      </div>
      <div>
        <Label>預設交割帳戶</Label>
        <AccountSelect value={f.cash_account_id} onChange={(v) => set({ cash_account_id: v })} accounts={accounts} exclude={f.account_id} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label hint="折">手續費折數</Label>
          <input type="number" min="0.1" max="10" step="0.1" value={f.discount} onChange={(e) => set({ discount: e.target.value })} className={field} />
        </div>
        <div>
          <Label>整股最低</Label>
          <input type="number" min="0" value={f.min_fee} onChange={(e) => set({ min_fee: e.target.value })} className={field} />
        </div>
        <div>
          <Label>零股最低</Label>
          <input type="number" min="0" value={f.min_fee_odd} onChange={(e) => set({ min_fee_odd: e.target.value })} className={field} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        手續費 = 成交金額 × 0.1425% × 折數（10 = 不打折、6 = 6 折、2.8 = 2.8 折）。證交稅：股票 0.3%、ETF 0.1%、債券 ETF 免稅。每筆都還能自己改。
      </p>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 主頁 ---------- */
function Stat({ label, value, sub, cls = "text-slate-800" }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-black ${cls}`}>{value}</p>
      {sub && <p className={`text-xs font-semibold ${cls}`}>{sub}</p>}
    </div>
  );
}

export default function Invest() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("trades");
  const [modal, setModal] = useState(null); // {type: trade|div|settings, initial}
  const [menu, setMenu] = useState(null); // 點持股展開的代號
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  function load(quiet = false) {
    if (!quiet) setLoading(true);
    getPortfolio()
      .then((d) => {
        setData(d);
        setErr("");
        setUpdatedAt(new Date());
      })
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }
  function loadAccounts() {
    listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }
  useEffect(() => {
    load();
    loadAccounts();
    // 開著頁面時每 60 秒更新報價
    timer.current = setInterval(() => document.visibilityState === "visible" && load(true), 60000);
    return () => clearInterval(timer.current);
  }, []);

  const s = data?.summary;
  const settings = data?.settings || {};
  const holdings = data?.holdings || [];
  const accName = (id) => accounts.find((a) => a.id === id)?.name;
  const ledgerReady = settings.account_id && settings.cash_account_id;
  const tradesByMonth = useMemo(() => data?.trades || [], [data]);

  function saved() {
    setModal(null);
    load(true);
  }
  async function editManualPrice(h) {
    const v = prompt(`${h.code} ${h.name} 抓不到報價，手動輸入目前價格（清空＝取消手動價）`, h.price ?? "");
    if (v === null) return;
    await setManualPrice(h.code, Number(v) || null);
    load(true);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">📈 投資</h1>
          <p className="text-xs text-slate-400">
            台股即時報價（約 5 秒延遲）{updatedAt && `・${updatedAt.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 更新`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal({ type: "trade", initial: { side: "buy" } })} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-rose-600">＋ 買進</button>
          <button onClick={() => setModal({ type: "trade", initial: { side: "sell" } })} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700">＋ 賣出</button>
          <button onClick={() => setModal({ type: "div" })} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-600">＋ 股利</button>
          <button onClick={() => load(true)} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50" title="更新報價">↻</button>
          <button onClick={() => setModal({ type: "settings" })} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50" title="設定">⚙</button>
        </div>
      </div>

      {data && !ledgerReady && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <span>💡 設定「證券帳戶」和「交割帳戶」後，買賣會自動記到記帳（記成轉帳，不會算成支出）。</span>
          <button onClick={() => setModal({ type: "settings" })} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600">去設定</button>
        </div>
      )}
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</p>}

      {loading && !data ? (
        <p className="py-16 text-center text-sm text-slate-400">載入中…</p>
      ) : data && (
        <>
          {/* 總覽 */}
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/10">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-rose-500/20 blur-2xl" />
            <p className="text-xs font-medium text-slate-400">持股市值</p>
            <p className="mt-1 text-4xl font-black tracking-tight">{money(s.market_value)}</p>
            <p className="mt-1 text-sm">
              <span className="text-slate-400">今日 </span>
              <b className={s.day_change > 0 ? "text-rose-400" : s.day_change < 0 ? "text-emerald-400" : "text-slate-300"}>{signed(s.day_change)}</b>
              <span className="ml-3 text-slate-400">未實現 </span>
              <b className={s.unrealized > 0 ? "text-rose-400" : s.unrealized < 0 ? "text-emerald-400" : "text-slate-300"}>
                {signed(s.unrealized)} {pct(s.unrealized_pct)}
              </b>
            </p>
            {s.quotes_missing?.length > 0 && (
              <p className="mt-1 text-xs text-amber-300">⚠ {s.quotes_missing.join("、")} 抓不到報價，暫以成本計算（可點該檔手動輸入價格）</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="投入成本" value={money(s.cost)} />
            <Stat label="已實現損益" value={signed(s.realized)} cls={tone(s.realized)} />
            <Stat label="累計股利" value={money(s.dividends)} cls="text-amber-600" />
            <Stat label="總報酬（未實現＋已實現＋股利）" value={signed(s.total_return)} cls={tone(s.total_return)} />
          </div>

          {/* 持股 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-black text-slate-900">持股 <span className="text-sm font-medium text-slate-400">{holdings.length} 檔</span></h2>
            {holdings.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">還沒有持股，按「＋ 買進」記第一筆</p>
            ) : (
              <>
                {/* 桌面：表格 */}
                <table className="hidden w-full text-sm md:table">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                      <th className="py-2 font-medium">股票</th>
                      <th className="py-2 text-right font-medium">持有</th>
                      <th className="py-2 text-right font-medium">均價</th>
                      <th className="py-2 text-right font-medium">現價</th>
                      <th className="py-2 text-right font-medium">市值</th>
                      <th className="py-2 text-right font-medium">未實現損益</th>
                      <th className="py-2 text-right font-medium">已實現＋股利</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.code} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="py-2.5">
                          <p className="font-bold text-slate-800">{h.name || h.code}</p>
                          <p className="font-mono text-xs text-slate-400">{h.code}</p>
                        </td>
                        <td className="py-2.5 text-right text-slate-700">{fmtShares(h.shares)}</td>
                        <td className="py-2.5 text-right text-slate-500">{price2(h.avg)}</td>
                        <td className="py-2.5 text-right">
                          {h.price == null ? (
                            <button onClick={() => editManualPrice(h)} className="text-xs font-semibold text-amber-600 hover:underline">輸入價格</button>
                          ) : (
                            <>
                              <p className="font-semibold text-slate-800">
                                {price2(h.price)}
                                {h.price_source === "手動" && <button onClick={() => editManualPrice(h)} className="ml-1 text-[10px] text-amber-600">手動</button>}
                              </p>
                              <p className={`text-xs ${tone(h.change)}`}>{pct(h.change_pct)}</p>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-800">{money(h.market_value)}</td>
                        <td className={`py-2.5 text-right font-bold ${tone(h.unrealized)}`}>
                          {signed(h.unrealized)}
                          <p className="text-xs font-semibold">{pct(h.unrealized_pct)}</p>
                        </td>
                        <td className={`py-2.5 text-right text-xs ${tone(h.realized + h.dividends)}`}>{h.realized || h.dividends ? signed(h.realized + h.dividends) : "—"}</td>
                        <td className="py-2.5 pl-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setModal({ type: "trade", initial: { side: "buy", code: h.code, name: h.name } })} className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100">買</button>
                            <button onClick={() => setModal({ type: "trade", initial: { side: "sell", code: h.code, name: h.name, price: h.price ?? "" } })} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100">賣</button>
                            <button onClick={() => setModal({ type: "div", initial: { code: h.code, name: h.name } })} className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100">息</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 手機：卡片 */}
                <div className="space-y-2 md:hidden">
                  {holdings.map((h) => (
                    <div key={h.code} className="rounded-xl bg-slate-50 p-3">
                      <button onClick={() => setMenu(menu === h.code ? null : h.code)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-800">{h.name || h.code} <span className="font-mono text-xs font-normal text-slate-400">{h.code}</span></p>
                            <p className="text-xs text-slate-500">{fmtShares(h.shares)}・均價 {price2(h.avg)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-bold text-slate-800">{h.price == null ? "—" : price2(h.price)} <span className={`text-xs ${tone(h.change)}`}>{pct(h.change_pct)}</span></p>
                            <p className="text-xs text-slate-500">市值 {money(h.market_value)}</p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="text-slate-400">未實現</span>
                          <span className={`font-bold ${tone(h.unrealized)}`}>{signed(h.unrealized)} {pct(h.unrealized_pct)}</span>
                        </div>
                      </button>
                      {menu === h.code && (
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                          <button onClick={() => setModal({ type: "trade", initial: { side: "buy", code: h.code, name: h.name } })} className="rounded-lg bg-rose-500 py-1.5 text-xs font-bold text-white">買進</button>
                          <button onClick={() => setModal({ type: "trade", initial: { side: "sell", code: h.code, name: h.name, price: h.price ?? "" } })} className="rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white">賣出</button>
                          <button onClick={() => setModal({ type: "div", initial: { code: h.code, name: h.name } })} className="rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-white">股利</button>
                          <button onClick={() => editManualPrice(h)} className="rounded-lg bg-white py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">手動價</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 紀錄 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {[["trades", `交易紀錄 ${data.trades.length}`], ["divs", `股利 ${data.dividends.length}`], ["closed", `已出清 ${data.closed.length}`]].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-1.5 transition ${tab === k ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>{label}</button>
              ))}
            </div>

            {tab === "trades" && (
              <ul className="divide-y divide-slate-50">
                {tradesByMonth.length === 0 && <li className="py-6 text-center text-sm text-slate-400">還沒有交易</li>}
                {tradesByMonth.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setModal({ type: "trade", initial: t })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50/60">
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-black ${t.side === "buy" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>{t.side === "buy" ? "買" : "賣"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{t.name || t.code} <span className="font-mono text-xs font-normal text-slate-400">{t.code}</span></p>
                        <p className="truncate text-xs text-slate-400">
                          {t.date}・{fmtShares(t.shares)} @ {price2(t.price)}
                          {t.ledger && t.tx_main_id ? `・已記帳（${accName(t.cash_account_id) || "?"}）` : "・未記帳"}
                          {t.note && `・${t.note}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-slate-800">{money(t.side === "buy" ? t.shares * t.price + t.fee : t.shares * t.price - t.fee - t.tax)}</p>
                        {t.side === "sell" && t.realized != null && <p className={`text-xs font-semibold ${tone(t.realized)}`}>損益 {signed(t.realized)}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tab === "divs" && (
              <ul className="divide-y divide-slate-50">
                {data.dividends.length === 0 && <li className="py-6 text-center text-sm text-slate-400">還沒有股利紀錄</li>}
                {data.dividends.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setModal({ type: "div", initial: d })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50/60">
                      <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">息</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{d.name || d.code} <span className="font-mono text-xs font-normal text-slate-400">{d.code}</span></p>
                        <p className="truncate text-xs text-slate-400">{d.date}{d.stock_shares ? `・配股 ${fmtShares(d.stock_shares)}` : ""}{d.ledger && d.tx_id ? "・已記帳" : ""}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-amber-600">{d.cash ? money(d.cash) : "—"}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tab === "closed" && (
              <ul className="divide-y divide-slate-50">
                {data.closed.length === 0 && <li className="py-6 text-center text-sm text-slate-400">沒有已全部賣出的股票</li>}
                {data.closed.map((c) => (
                  <li key={c.code} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{c.name || c.code} <span className="font-mono text-xs font-normal text-slate-400">{c.code}</span></p>
                      {c.dividends > 0 && <p className="text-xs text-amber-600">股利 {money(c.dividends)}</p>}
                    </div>
                    <p className={`text-sm font-bold ${tone(c.realized)}`}>{signed(c.realized)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {modal?.type === "trade" && (
        <TradeModal initial={modal.initial} holdings={holdings} settings={settings} accounts={accounts} onClose={() => setModal(null)} onSaved={saved} />
      )}
      {modal?.type === "div" && (
        <DividendModal initial={modal.initial} holdings={holdings} settings={settings} accounts={accounts} onClose={() => setModal(null)} onSaved={saved} />
      )}
      {modal?.type === "settings" && (
        <SettingsModal
          settings={settings}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={(close) => {
            loadAccounts();
            if (close) saved();
            else load(true);
          }}
        />
      )}
    </div>
  );
}
