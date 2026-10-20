import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProperty,
  deleteProperty,
  deletePropertyFile,
  fileUrl,
  getPropertySettings,
  listProperty,
  markDateDone,
  savePropertySettings,
  updateProperty,
  uploadPropertyFile,
} from "../api/property";
import { openImage } from "../lightbox";
import { compressImageFile } from "../imageCompress";
import {
  FREQ_REPEAT_MAP,
  KIND,
  KINDS,
  REMIND_OPTIONS,
  REPEATS,
  REPEAT_MONTHS,
  STATUSES,
  addMonthsISO,
  newDateId,
  nextFrom,
  valueOf,
  yearlyPremium,
} from "../propertyKinds";

const field =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";
const btn = "rounded-xl px-3.5 py-2 text-sm font-semibold transition active:scale-95";
const money = (n) => (n == null || n === "" ? "" : "$" + Math.round(Number(n)).toLocaleString("en-US"));
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x?.msg || "").join("；");
  return (typeof d === "string" && d) || e?.message || "失敗";
};
const fmtDate = (s) => (s ? s.replaceAll("-", "/") : "");
const repeatLabel = (r) => REPEATS.find(([k]) => k === r)?.[1] || "";
const statusLabel = (s) => STATUSES.find(([k]) => k === s)?.[1] || s;
function fmtSize(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// 日期狀態 → 顏色、文字
function badge(d) {
  if (d.done) return { cls: "bg-emerald-50 text-emerald-600 ring-emerald-100", text: "✓ 已完成" };
  if (!d.date) return { cls: "bg-slate-50 text-slate-400 ring-slate-200", text: "未填日期" };
  const left = d.days_left;
  if (left < 0) {
    if (d.repeat === "none") return { cls: "bg-slate-100 text-slate-500 ring-slate-200", text: `已到期 ${-left} 天` };
    return { cls: "bg-rose-50 text-rose-600 ring-rose-200", text: `逾期 ${-left} 天` };
  }
  if (left === 0) return { cls: "bg-rose-50 text-rose-600 ring-rose-200", text: "今天" };
  if (d.state === "soon") return { cls: "bg-amber-50 text-amber-700 ring-amber-200", text: `剩 ${left} 天` };
  if (left > 365) return { cls: "bg-slate-50 text-slate-500 ring-slate-200", text: `${(left / 365).toFixed(1)} 年後` };
  return { cls: "bg-slate-50 text-slate-500 ring-slate-200", text: `${left} 天後` };
}
// 要不要列在「近期要處理」：快到、今天、逾期（不重複的過了 30 天就不再列）
const isUpcoming = (d) =>
  !d.done && d.date && d.days_left != null && (d.state === "soon" || (d.days_left < 0 && (d.repeat !== "none" || d.days_left >= -30)));

function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className={`flex max-h-[94vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function Label({ children, hint }) {
  return (
    <label className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-500">
      <span>{children}</span>
      {hint && <span className="font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

/* ---------- 新增／編輯 ---------- */
function ItemModal({ initial, defaultDays, presetKind, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [kind, setKind] = useState(initial?.kind || presetKind || null);
  const [f, setF] = useState(() => ({
    name: initial?.name || "",
    status: initial?.status || "active",
    purchase_date: initial?.purchase_date || "",
    purchase_price: initial?.purchase_price ?? "",
    current_value: initial?.current_value ?? "",
    fields: { ...(initial?.fields || {}) },
    extra: (initial?.extra || []).map((x) => ({ ...x })),
    dates: (initial?.dates || []).map(({ id, label, date, repeat, remind_days, done, note, history }) => ({ id, label, date, repeat, remind_days, done, note, history })),
    note: initial?.note || "",
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const K = kind ? KIND[kind] : null;
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setField = (key, v) => setF((x) => ({ ...x, fields: { ...x.fields, [key]: v } }));
  const setDate = (i, patch) => setF((x) => ({ ...x, dates: x.dates.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  function pickKind(k) {
    setKind(k);
    // 新增時先放好這類常見的日期（牌照稅、燃料費、強制險…），不需要的再刪
    if (!isEdit && f.dates.length === 0) {
      const auto = KIND[k].quick.filter((q) => q.auto).map((q) => ({ id: newDateId(), done: false, note: "", ...q.make({ ...f, fields: f.fields }, defaultDays) }));
      setF((x) => ({ ...x, dates: auto }));
    }
  }
  // 從某類別的「＋ 新增」進來：一樣先放好這類常見的日期
  useEffect(() => {
    if (!isEdit && presetKind) pickKind(presetKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addQuick(q) {
    setF((x) => ({ ...x, dates: [...x.dates, { id: newDateId(), done: false, note: "", ...q.make(x, defaultDays) }] }));
  }
  // 保險：改繳費方式或生效日 → 「下次繳費」跟著換重複週期、推算下一期
  function setPayFreq(v) {
    setF((x) => {
      const repeat = FREQ_REPEAT_MAP[v] || "yearly";
      const dates = x.dates.map((d) =>
        d.label === "下次繳費" ? { ...d, repeat, date: d.date || nextFrom(x.purchase_date, REPEAT_MONTHS[repeat]) } : d
      );
      return { ...x, fields: { ...x.fields, pay_freq: v }, dates };
    });
  }

  async function save() {
    setSaving(true);
    setErr("");
    const body = {
      kind,
      name: f.name.trim(),
      status: f.status,
      purchase_date: f.purchase_date || "",
      purchase_price: f.purchase_price === "" ? null : Number(f.purchase_price),
      current_value: f.current_value === "" ? null : Number(f.current_value),
      fields: f.fields,
      extra: f.extra.filter((x) => x.label.trim()),
      dates: f.dates.filter((d) => d.label.trim()),
      note: f.note,
    };
    try {
      const saved = isEdit ? await updateProperty(initial.id, body) : await createProperty(body);
      onSaved(saved, !isEdit);
    } catch (e) {
      setErr(errMsg(e));
      setSaving(false);
    }
  }

  if (!K) {
    return (
      <Modal title="新增：要記錄哪一類？" onClose={onClose}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => pickKind(k.key)} className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 px-3 py-4 ring-1 ring-slate-100 transition hover:bg-indigo-50 hover:ring-indigo-200">
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-2xl ${k.tint}`}>{k.emoji}</span>
              <span className="text-sm font-bold text-slate-700">{k.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={`${K.emoji} ${isEdit ? "編輯" : "新增"}${K.label}`}
      onClose={onClose}
      footer={
        <>
          {!isEdit && <button onClick={() => setKind(null)} className={`${btn} text-slate-500 hover:bg-slate-100`}>‹ 換類別</button>}
          <div className="flex-1" />
          <button onClick={onClose} className={`${btn} text-slate-500 hover:bg-slate-100`}>取消</button>
          <button disabled={saving || !f.name.trim()} onClick={save} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:opacity-40`}>{saving ? "儲存中…" : "儲存"}</button>
        </>
      }
    >
      {/* 基本 */}
      <section className="space-y-3">
        <div>
          <Label>名稱 *</Label>
          <input autoFocus={!isEdit} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={K.nameHint} className={`${field} font-semibold`} />
        </div>
        <div className={`grid gap-3 ${K.showPrice ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div>
            <Label>{K.purchaseLabel}</Label>
            <input type="date" value={f.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} className={field} />
          </div>
          {K.showPrice && (
            <>
              <div>
                <Label>購買價格</Label>
                <input type="number" inputMode="decimal" min="0" value={f.purchase_price} onChange={(e) => set({ purchase_price: e.target.value })} className={field} />
              </div>
              <div>
                <Label hint="不填就用購買價">目前估值</Label>
                <input type="number" inputMode="decimal" min="0" value={f.current_value} onChange={(e) => set({ current_value: e.target.value })} className={field} />
              </div>
            </>
          )}
          {isEdit && (
            <div>
              <Label>狀態</Label>
              <select value={f.status} onChange={(e) => set({ status: e.target.value })} className={field}>
                {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* 類別欄位 */}
      <section>
        <p className="mb-2 text-xs font-black tracking-wide text-slate-400">{K.label}資料</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {K.fields.map((fd) => (
            <div key={fd.key} className={fd.wide || fd.type === "textarea" ? "sm:col-span-2" : ""}>
              <Label>{fd.label}</Label>
              {fd.type === "select" ? (
                <select value={f.fields[fd.key] || ""} onChange={(e) => (fd.key === "pay_freq" ? setPayFreq(e.target.value) : setField(fd.key, e.target.value))} className={field}>
                  <option value="">（未選）</option>
                  {fd.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : fd.type === "textarea" ? (
                <textarea rows={2} value={f.fields[fd.key] || ""} onChange={(e) => setField(fd.key, e.target.value)} placeholder={fd.placeholder} className={`${field} resize-y`} />
              ) : fd.type === "date" ? (
                <input type="date" value={f.fields[fd.key] || ""} onChange={(e) => setField(fd.key, e.target.value)} className={field} />
              ) : (
                <input type={fd.type === "money" ? "number" : "text"} inputMode={fd.type === "money" ? "decimal" : undefined} value={f.fields[fd.key] || ""} onChange={(e) => setField(fd.key, e.target.value)} placeholder={fd.placeholder} className={field} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 重要日期 */}
      <section>
        <p className="mb-1 text-xs font-black tracking-wide text-slate-400">⏰ 重要日期（保固、繳費、稅、驗車…到期前會提醒）</p>
        <div className="space-y-2">
          {f.dates.map((d, i) => (
            <div key={d.id} className={`rounded-xl p-2.5 ring-1 ${d.done ? "bg-emerald-50/50 ring-emerald-100" : "bg-slate-50 ring-slate-100"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <input value={d.label} onChange={(e) => setDate(i, { label: e.target.value })} placeholder="名稱，例：保固到期" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-indigo-400 sm:max-w-[13rem]" />
                <input type="date" value={d.date} onChange={(e) => setDate(i, { date: e.target.value, done: false })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
                <select value={d.repeat} onChange={(e) => setDate(i, { repeat: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select value={d.remind_days} onChange={(e) => setDate(i, { remind_days: Number(e.target.value) })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" title="提前幾天提醒">
                  {REMIND_OPTIONS.map(([k, l]) => <option key={k} value={k}>🔔 {l}</option>)}
                </select>
                <button onClick={() => set({ dates: f.dates.filter((_, j) => j !== i) })} className="ml-auto rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-rose-50 hover:text-rose-500" title="刪除">✕</button>
              </div>
              {d.done && <p className="mt-1 text-[11px] text-emerald-600">✓ 已完成（改日期就會重新提醒）</p>}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {K.quick.filter((q) => !f.dates.some((d) => d.label === q.label)).map((q) => (
            <button key={q.label} type="button" onClick={() => addQuick(q)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
              ＋ {q.label}
            </button>
          ))}
          <button type="button" onClick={() => set({ dates: [...f.dates, { id: newDateId(), label: "", date: "", repeat: "none", remind_days: defaultDays, done: false, note: "" }] })} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
            ＋ 自訂日期
          </button>
        </div>
        {K.quick.some((q) => q.label.startsWith("保固")) && !f.purchase_date && (
          <p className="mt-1 text-[11px] text-amber-600">先填購買日期，「保固 N 年」才能自動算到期日</p>
        )}
      </section>

      {/* 自訂欄位 */}
      <section>
        <p className="mb-1 text-xs font-black tracking-wide text-slate-400">自訂欄位</p>
        <div className="space-y-1.5">
          {f.extra.map((x, i) => (
            <div key={i} className="flex gap-1.5">
              <input value={x.label} onChange={(e) => set({ extra: f.extra.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} placeholder="欄位名稱" className={`${field} w-32 shrink-0 sm:w-40`} />
              <input value={x.value} onChange={(e) => set({ extra: f.extra.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} placeholder="內容" className={field} />
              <button onClick={() => set({ extra: f.extra.filter((_, j) => j !== i) })} className="shrink-0 rounded-lg px-2 text-slate-300 hover:text-rose-500">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set({ extra: [...f.extra, { label: "", value: "" }] })} className="mt-1.5 text-xs font-semibold text-indigo-600 hover:underline">＋ 新增欄位</button>
      </section>

      <section>
        <Label>備註</Label>
        <textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} className={`${field} resize-y`} />
      </section>
      {!isEdit && <p className="text-xs text-slate-400">存好後可以在詳細頁上傳照片、保單、發票、保固卡。</p>}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 詳細資料（右側） ---------- */
function Detail({ item, onClose, onEdit, onChanged, onDeleted }) {
  const K = KIND[item.kind] || KIND.other;
  const [uploads, setUploads] = useState([]);
  const fileRef = useRef(null);
  const rows = [
    [K.purchaseLabel, fmtDate(item.purchase_date)],
    ...(K.showPrice ? [["購買價格", money(item.purchase_price)], ["目前估值", money(item.current_value)]] : []),
    ...K.fields.map((fd) => [fd.label, fd.type === "date" ? fmtDate(item.fields[fd.key]) : fd.type === "money" ? money(item.fields[fd.key]) : item.fields[fd.key]]),
    ...item.extra.map((x) => [x.label, x.value]),
  ].filter(([, v]) => v);
  const images = item.files.filter((x) => x.mime.startsWith("image/"));
  const others = item.files.filter((x) => !x.mime.startsWith("image/"));
  const datesSorted = [...item.dates].sort((a, b) => (a.done - b.done) || (a.date || "9999").localeCompare(b.date || "9999"));

  async function done(d, undo = false) {
    onChanged(await markDateDone(item.id, d.id, undo));
  }
  async function upload(list) {
    for (const file of [...(list || [])]) {
      const key = `${Date.now()}${Math.random()}`;
      setUploads((u) => [...u, { key, name: file.name, pct: 0 }]);
      try {
        let f = file;
        // 手機照片動輒好幾 MB：先壓到 2000px 以內再傳（PDF、其他檔案原樣）
        if (file.type.startsWith("image/") && !file.type.includes("gif") && file.size > 600 * 1024) {
          const dataUrl = await compressImageFile(file, 2000, 0.85);
          const blob = await (await fetch(dataUrl)).blob();
          f = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" });
        }
        const saved = await uploadPropertyFile(item.id, f, (pct) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct } : x))));
        onChanged(saved);
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, err: errMsg(e) } : x)));
      }
    }
  }
  async function removeFile(fl) {
    if (!window.confirm(`刪除附件「${fl.name}」？`)) return;
    onChanged(await deletePropertyFile(fl.id));
  }
  async function remove() {
    if (!window.confirm(`刪除「${item.name}」和所有附件？無法復原。\n（已經賣掉、解約的，建議用「編輯 → 狀態」改成已結束，資料會保留）`)) return;
    await deleteProperty(item.id);
    onDeleted(item.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-slate-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button onClick={onClose} className="mt-1 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" title="關閉">‹</button>
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${K.tint}`}>{K.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-slate-400">
              {K.label}
              {item.status !== "active" && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">{statusLabel(item.status)}</span>}
            </p>
            <h3 className="break-words text-lg font-black leading-tight text-slate-900">{item.name}</h3>
            {K.subtitle(item) && <p className="mt-0.5 truncate text-xs text-slate-500">{K.subtitle(item)}</p>}
          </div>
          <button onClick={onEdit} className={`${btn} shrink-0 bg-indigo-600 text-white hover:bg-indigo-700`}>✏️ 編輯</button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files); }}>
          {/* 重要日期 */}
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <h4 className="mb-2 text-sm font-black text-slate-800">⏰ 重要日期</h4>
            {datesSorted.length === 0 ? (
              <p className="text-xs text-slate-400">還沒有。按「編輯」加保固到期、繳費日、牌照稅、驗車…到期前會提醒你。</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {datesSorted.map((d) => {
                  const b = badge(d);
                  const last = d.history?.[d.history.length - 1];
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${d.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{d.label}</p>
                        <p className="text-xs text-slate-400">
                          {d.date ? fmtDate(d.date) : "—"}
                          {d.repeat !== "none" && `・${repeatLabel(d.repeat)}`}
                          {d.remind_days >= 0 ? `・🔔 前 ${d.remind_days} 天` : "・不提醒"}
                          {last && `・上次處理 ${fmtDate(last.done_at)}`}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${b.cls}`}>{b.text}</span>
                      {d.date && !d.done && (
                        <button onClick={() => done(d)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${d.state === "soon" || d.state === "overdue" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"}`} title={d.repeat !== "none" ? `標記已處理，日期推到下一期（${fmtDate(addMonthsISO(d.date, REPEAT_MONTHS[d.repeat]))}）` : "標記完成"}>
                          ✓ {d.repeat !== "none" ? "已處理 →下期" : "完成"}
                        </button>
                      )}
                      {d.done && <button onClick={() => done(d, true)} className="text-xs text-slate-400 hover:text-indigo-600">復原</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 基本資料 */}
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <h4 className="mb-2 text-sm font-black text-slate-800">📋 資料</h4>
            {rows.length === 0 ? (
              <p className="text-xs text-slate-400">只有名稱，按「編輯」補資料。</p>
            ) : (
              <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                {rows.map(([k, v]) => (
                  <div key={k} className={String(v).length > 30 || String(v).includes("\n") ? "sm:col-span-2" : ""}>
                    <dt className="text-[11px] font-semibold text-slate-400">{k}</dt>
                    <dd className="whitespace-pre-line break-words text-sm text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* 附件 */}
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-800">📎 照片／保單／發票</h4>
              <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">＋ 上傳</button>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,*/*" className="hidden" onChange={(e) => { const l = [...e.target.files]; e.target.value = ""; upload(l); }} />
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {images.map((im) => (
                  <div key={im.id} className="group relative">
                    <img src={fileUrl(im.url)} alt="" loading="lazy" onClick={() => openImage(fileUrl(im.url))} className="aspect-square w-full cursor-zoom-in rounded-xl object-cover ring-1 ring-slate-100" />
                    <button onClick={() => removeFile(im)} className="absolute right-1 top-1 rounded-md bg-white/90 px-1.5 text-xs text-rose-500 opacity-0 shadow transition group-hover:opacity-100 max-md:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            )}
            {others.length > 0 && (
              <ul className="mt-2 space-y-1">
                {others.map((fl) => (
                  <li key={fl.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-sm">
                    <span>{fl.mime.includes("pdf") ? "📄" : "📎"}</span>
                    <a href={fileUrl(fl.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-slate-700 hover:text-indigo-600">{fl.name}</a>
                    <span className="text-xs text-slate-400">{fmtSize(fl.size)}</span>
                    <a href={fileUrl(fl.url, true)} className="text-xs text-slate-400 hover:text-indigo-600" title="下載">⬇</a>
                    <button onClick={() => removeFile(fl)} className="text-xs text-slate-300 hover:text-rose-500">✕</button>
                  </li>
                ))}
              </ul>
            )}
            {uploads.map((u) => (
              <p key={u.key} className={`mt-1 truncate text-xs ${u.err ? "text-rose-600" : "text-slate-500"}`}>
                {u.err ? `✕ ${u.name}：${u.err}` : `上傳中 ${u.pct}%：${u.name}`}
                {u.err && <button onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} className="ml-2 underline">關閉</button>}
              </p>
            ))}
            {item.files.length === 0 && uploads.length === 0 && <p className="text-xs text-slate-400">拍保單、發票、保固卡、行照放這裡，要用時不用翻抽屜（也可以把檔案拖進來）。</p>}
          </section>

          {item.note && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <h4 className="mb-1 text-sm font-black text-slate-800">📝 備註</h4>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.note}</p>
            </section>
          )}
          <button onClick={remove} className="w-full rounded-xl py-2 text-xs font-semibold text-rose-400 hover:bg-rose-50 hover:text-rose-600">刪除這一項</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 提醒設定 ---------- */
function SettingsModal({ initial, onClose, onSaved }) {
  const [s, setS] = useState(initial);
  const [err, setErr] = useState("");
  async function save() {
    try {
      onSaved(await savePropertySettings(s));
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      title="⚙ 提醒設定"
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={onClose} className={`${btn} text-slate-500 hover:bg-slate-100`}>取消</button>
          <button onClick={save} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>儲存</button>
        </>
      }
    >
      <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3">
        <span className="text-sm font-semibold text-slate-700">📲 到期推播提醒</span>
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-5 w-5 accent-indigo-600" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>每天幾點提醒</Label>
          <input type="time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} className={field} />
        </div>
        <div>
          <Label>新日期預設提前</Label>
          <select value={s.default_days} onChange={(e) => setS({ ...s, default_days: Number(e.target.value) })} className={field}>
            {REMIND_OPTIONS.filter(([k]) => k >= 0).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        到期前「設定的天數、前 7 天、前 3 天、前 1 天、當天」各提醒一次；會重複的事項（保費、牌照稅…）逾期沒按「已處理」，每週再提醒。手機要先在「設定 → 通知」開啟這台的通知。
      </p>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 主頁 ---------- */
function Stat({ label, value, sub, tone = "text-slate-900" }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-black ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Property() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [cfg, setCfg] = useState({ enabled: true, time: "09:00", default_days: 30 });
  const [kindSel, setKindSel] = useState(() => {
    try {
      return localStorage.getItem("dispatch.propKind") || "all";
    } catch {
      return "all";
    }
  });
  const [statusSel, setStatusSel] = useState("active");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null); // {type: "item", initial, kind} | {type: "settings"}
  const [showAllUp, setShowAllUp] = useState(false);

  function load() {
    return listProperty()
      .then((rows) => {
        setItems(rows);
        setErr("");
      })
      .catch((e) => {
        setItems([]);
        setErr(errMsg(e));
      });
  }
  useEffect(() => {
    load();
    getPropertySettings().then(setCfg).catch(() => {});
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("dispatch.propKind", kindSel);
    } catch {
      /* 無痕模式 */
    }
  }, [kindSel]);

  const replace = (it) => setItems((cur) => cur.map((x) => (x.id === it.id ? it : x)));
  const active = (items || []).filter((x) => x.status === "active");
  const totalValue = active.reduce((s, x) => s + (Number(valueOf(x)) || 0), 0);
  const premium = active.reduce((s, x) => s + yearlyPremium(x), 0);
  const insCount = active.filter((x) => x.kind === "insurance").length;

  // 近期要處理（只看使用中的）
  const upcoming = useMemo(() => {
    const out = [];
    for (const it of active) for (const d of it.dates) if (isUpcoming(d)) out.push({ it, d });
    return out.sort((a, b) => a.d.days_left - b.d.days_left);
  }, [items]);
  const overdueCount = upcoming.filter((x) => x.d.days_left < 0).length;

  const counts = useMemo(() => {
    const c = { all: 0 };
    for (const it of items || []) {
      if (statusSel !== "all" && (statusSel === "active") !== (it.status === "active")) continue;
      c.all += 1;
      c[it.kind] = (c[it.kind] || 0) + 1;
    }
    return c;
  }, [items, statusSel]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (items || [])
      .filter((it) => statusSel === "all" || (statusSel === "active") === (it.status === "active"))
      .filter((it) => kindSel === "all" || it.kind === kindSel)
      .filter((it) => {
        if (!words.length) return true;
        const text = [it.name, it.note, ...Object.values(it.fields), ...it.extra.map((x) => `${x.label} ${x.value}`), ...it.dates.map((d) => d.label)].join(" ").toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .map((it) => {
        const next = it.dates.filter((d) => !d.done && d.date && d.days_left != null).sort((a, b) => a.days_left - b.days_left);
        // 卡片上先秀最該注意的：逾期／快到的優先，其次最近的
        const pick = next.find((d) => d.state === "overdue" && d.repeat !== "none") || next.find((d) => d.days_left >= 0) || next[0];
        return { it, pick, more: next.length - (pick ? 1 : 0) };
      })
      .sort((a, b) => {
        const ka = a.pick && a.pick.days_left >= -30 ? a.pick.days_left : 99999;
        const kb = b.pick && b.pick.days_left >= -30 ? b.pick.days_left : 99999;
        return ka - kb || a.it.name.localeCompare(b.it.name);
      });
  }, [items, kindSel, statusSel, q]);

  const opened = (items || []).find((x) => x.id === openId);

  if (items === null) return <p className="py-16 text-center text-sm text-slate-400">載入中…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">🏠 身家財產</h1>
          <p className="text-xs text-slate-400">保險、車子、貴重物品、3C 家電、房產：購買資料、保固、保單、繳費日，到期前提醒你</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal({ type: "settings" })} className={`${btn} bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50`} title="提醒設定">⚙ 提醒</button>
          <button onClick={() => setModal({ type: "item", kind: kindSel !== "all" ? kindSel : null })} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700`}>＋ 新增</button>
        </div>
      </div>
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="使用中／有效" value={`${active.length} 項`} sub={KINDS.filter((k) => active.some((x) => x.kind === k.key)).map((k) => `${k.emoji}${active.filter((x) => x.kind === k.key).length}`).join(" ") || "還沒有資料"} />
        <Stat label="財產估值" value={money(totalValue) || "$0"} sub="目前估值，沒填用購買價" />
        <Stat label="每年保費" value={money(premium) || "$0"} sub={`${insCount} 張有效保單`} tone="text-indigo-700" />
        <Stat label="近期要處理" value={`${upcoming.length} 件`} sub={overdueCount ? `其中逾期 ${overdueCount} 件` : "30 天內到期／逾期"} tone={overdueCount ? "text-rose-600" : upcoming.length ? "text-amber-600" : "text-slate-900"} />
      </div>

      {/* 近期要處理 */}
      {upcoming.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="mb-2 text-sm font-black text-amber-900">⏰ 近期要處理</h2>
          <ul className="space-y-1.5">
            {(showAllUp ? upcoming : upcoming.slice(0, 6)).map(({ it, d }) => {
              const b = badge(d);
              const K = KIND[it.kind] || KIND.other;
              return (
                <li key={`${it.id}-${d.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-amber-100">
                  <button onClick={() => setOpenId(it.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="text-lg">{K.emoji}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">{d.label}</span>
                      <span className="block truncate text-xs text-slate-500">{it.name}・{fmtDate(d.date)}</span>
                    </span>
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${b.cls}`}>{b.text}</span>
                  <button
                    onClick={async () => replace(await markDateDone(it.id, d.id))}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                    title={d.repeat !== "none" ? "已繳／已處理：日期推到下一期" : "標記完成"}
                  >
                    ✓ {d.repeat !== "none" ? "已處理" : "完成"}
                  </button>
                </li>
              );
            })}
          </ul>
          {upcoming.length > 6 && (
            <button onClick={() => setShowAllUp((v) => !v)} className="mt-2 text-xs font-semibold text-amber-800 hover:underline">
              {showAllUp ? "收起" : `顯示全部 ${upcoming.length} 件`}
            </button>
          )}
        </div>
      )}

      {/* 篩選 */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[{ key: "all", label: "全部", emoji: "" }, ...KINDS].map((k) => (
            <button key={k.key} onClick={() => setKindSel(k.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${kindSel === k.key ? "bg-slate-900 text-white shadow" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`}>
              {k.emoji} {k.label} <span className="text-xs opacity-60">{counts[k.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋名稱、保單號碼、車牌、序號…" className={`${field} bg-white`} />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-slate-400">✕</button>}
          </div>
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
            {[["active", "使用中"], ["ended", "已結束"], ["all", "全部"]].map(([k, l]) => (
              <button key={k} onClick={() => setStatusSel(k)} className={`rounded-lg px-3 py-1.5 ${statusSel === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 卡片 */}
      {shown.length === 0 ? (
        items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-4xl">🏠</p>
            <p className="mt-2 font-bold text-slate-800">開始記錄你的身家財產</p>
            <p className="mt-1 text-sm text-slate-500">從最常需要查的開始：保單、車子、剛買的 3C 保固。</p>
            <div className="mx-auto mt-4 grid max-w-lg grid-cols-3 gap-2 sm:grid-cols-4">
              {KINDS.map((k) => (
                <button key={k.key} onClick={() => setModal({ type: "item", kind: k.key })} className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-100 hover:bg-indigo-50 hover:text-indigo-700">
                  <span className="text-2xl">{k.emoji}</span>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">沒有符合的項目</p>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ it, pick, more }) => {
            const K = KIND[it.kind] || KIND.other;
            const b = pick && badge(pick);
            const sub = K.subtitle(it);
            const prem = yearlyPremium(it);
            return (
              <button key={it.id} onClick={() => setOpenId(it.id)}
                className={`flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${pick && (pick.state === "soon" || (pick.state === "overdue" && pick.repeat !== "none")) ? "ring-amber-200" : "ring-slate-100"} ${it.status !== "active" ? "opacity-60" : ""}`}>
                <div className="flex gap-3 p-3.5">
                  {it.cover ? (
                    <img src={fileUrl(it.cover)} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-slate-100" />
                  ) : (
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl ${K.tint}`}>{K.emoji}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                      {K.label}
                      {it.status !== "active" && <span className="rounded bg-slate-100 px-1 text-slate-500">{statusLabel(it.status)}</span>}
                      {it.files.length > 0 && <span className="font-normal">📎{it.files.length}</span>}
                    </p>
                    <p className="truncate font-black text-slate-900">{it.name}</p>
                    {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {[
                        it.purchase_date && `${K.purchaseLabel.replace("日期", "")} ${fmtDate(it.purchase_date)}`,
                        K.showPrice && (it.current_value ?? it.purchase_price) != null && money(it.current_value ?? it.purchase_price),
                        prem > 0 && `保費 ${money(prem)}／年`,
                      ].filter(Boolean).join("・")}
                    </p>
                  </div>
                </div>
                {pick && (
                  <div className="mt-auto flex items-center gap-2 border-t border-slate-50 bg-slate-50/60 px-3.5 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-600">⏰ {pick.label}・{fmtDate(pick.date)}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ring-1 ${b.cls}`}>{b.text}</span>
                    {more > 0 && <span className="shrink-0 text-slate-400">+{more}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {opened && (
        <Detail
          key={opened.id}
          item={opened}
          onClose={() => setOpenId(null)}
          onEdit={() => setModal({ type: "item", initial: opened })}
          onChanged={replace}
          onDeleted={(id) => {
            setOpenId(null);
            setItems((cur) => cur.filter((x) => x.id !== id));
          }}
        />
      )}
      {modal?.type === "item" && (
        <ItemModal
          initial={modal.initial}
          presetKind={modal.kind}
          defaultDays={cfg.default_days}
          onClose={() => setModal(null)}
          onSaved={(saved, isNew) => {
            setModal(null);
            if (isNew) {
              setItems((cur) => [...cur, saved]);
              setOpenId(saved.id); // 新增完直接打開，方便上傳照片／保單
            } else replace(saved);
          }}
        />
      )}
      {modal?.type === "settings" && (
        <SettingsModal
          initial={cfg}
          onClose={() => setModal(null)}
          onSaved={(c) => {
            setCfg(c);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
