import { useEffect, useMemo, useRef, useState } from "react";
import {
  commitImport,
  createCase,
  createRow,
  createTable,
  deleteCase,
  deleteRow,
  deleteTable,
  listCases,
  listRows,
  listTables,
  previewImport,
  searchCase,
  updateCase,
  updateRow,
  updateTable,
} from "../api/work";

const field =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";
const btn = "rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("；");
  return (typeof d === "string" && d) || e?.message || "失敗";
};
const CASE_EMOJIS = ["🏢", "🏗️", "💼", "🏭", "🏬", "🧑‍💻", "📦", "⭐"];
const TABLE_EMOJIS = ["📋", "📇", "☎️", "🧾", "🛠️", "🗂️", "📌", "🔖", "💾", "📝"];
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 無痕模式 */
    }
  },
};

function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className={`flex max-h-[92vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`} onClick={(e) => e.stopPropagation()}>
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

/* 遮住的欄位（例：密碼、遠端連線）：點一下才顯示 */
function Masked({ value }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }} className="text-left" title={show ? "點一下遮住" : "點一下顯示"}>
      {show ? <span className="whitespace-pre-line">{value}</span> : <span className="tracking-widest text-slate-400">•••• 👁</span>}
    </button>
  );
}

/* ---------- 案子 ---------- */
function CaseModal({ initial, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [f, setF] = useState({ name: initial?.name || "", emoji: initial?.emoji || "🏢", note: initial?.note || "", archived: initial?.archived || false });
  const [err, setErr] = useState("");
  async function save() {
    try {
      const c = isEdit ? await updateCase(initial.id, f) : await createCase(f);
      onSaved(c);
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function remove() {
    if (!confirm(`刪除案子「${initial.name}」？底下所有分類和資料都會一起刪掉，無法復原。\n（換工作建議用「封存」就好）`)) return;
    if (prompt(`確定要刪除請輸入案子名稱：${initial.name}`) !== initial.name) return;
    await deleteCase(initial.id);
    onSaved(null);
  }
  return (
    <Modal
      title={isEdit ? "編輯案子" : "新增案子"}
      onClose={onClose}
      footer={
        <>
          {isEdit && <button onClick={remove} className={`${btn} text-rose-500 hover:bg-rose-50`}>刪除</button>}
          <div className="flex-1" />
          <button onClick={onClose} className={`${btn} text-slate-500 hover:bg-slate-100`}>取消</button>
          <button disabled={!f.name.trim()} onClick={save} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:opacity-40`}>儲存</button>
        </>
      }
    >
      <p className="text-xs text-slate-500">一間公司一個案子（例：目前的公司），換工作時再開一個新的，舊的可以封存。</p>
      <div className="flex gap-2">
        <select value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-2 text-xl">
          {CASE_EMOJIS.map((x) => <option key={x}>{x}</option>)}
        </select>
        <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="公司名稱，例：中程資訊" className={field} />
      </div>
      <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="備註（例：任職期間、職稱）" className={field} />
      {isEdit && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
          封存（已離職，資料保留但收到「封存的案子」裡）
        </label>
      )}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 分類設定（名稱、欄位） ---------- */
function TableModal({ caseId, initial, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name || "");
  const [emoji, setEmoji] = useState(initial?.emoji || "📋");
  const [cols, setCols] = useState(
    initial?.columns?.length
      ? initial.columns
      : [
          { key: "", label: "名稱" },
          { key: "", label: "電話" },
          { key: "", label: "聯絡人" },
          { key: "", label: "備註" },
        ]
  );
  const [err, setErr] = useState("");
  const setCol = (i, patch) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i, d) =>
    setCols((cs) => {
      const n = [...cs];
      const j = i + d;
      if (j < 0 || j >= n.length) return cs;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  async function save() {
    setErr("");
    try {
      const body = { name, emoji, columns: cols.filter((c) => c.label.trim()) };
      const t = isEdit ? await updateTable(initial.id, body) : await createTable(caseId, body);
      onSaved(t);
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function remove() {
    if (!confirm(`刪除分類「${initial.name}」和裡面 ${initial.row_count} 筆資料？無法復原。`)) return;
    await deleteTable(initial.id);
    onSaved(null);
  }
  return (
    <Modal
      title={isEdit ? "分類設定" : "新增分類"}
      onClose={onClose}
      footer={
        <>
          {isEdit && <button onClick={remove} className={`${btn} text-rose-500 hover:bg-rose-50`}>刪除分類</button>}
          <div className="flex-1" />
          <button onClick={onClose} className={`${btn} text-slate-500 hover:bg-slate-100`}>取消</button>
          <button disabled={!name.trim()} onClick={save} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:opacity-40`}>儲存</button>
        </>
      }
    >
      <div className="flex gap-2">
        <select value={emoji} onChange={(e) => setEmoji(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 text-xl">
          {TABLE_EMOJIS.map((x) => <option key={x}>{x}</option>)}
        </select>
        <input autoFocus={!isEdit} value={name} onChange={(e) => setName(e.target.value)} placeholder="分類名稱，例：客戶聯繫單" className={field} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500">欄位（🔒 = 畫面上先遮住，適合密碼、遠端連線資訊）</p>
        <div className="space-y-1.5">
          {cols.map((c, i) => (
            <div key={c.key || `n${i}`} className="flex items-center gap-1.5">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} className="px-1 text-[10px] leading-none text-slate-400 hover:text-indigo-600">▲</button>
                <button onClick={() => move(i, 1)} className="px-1 text-[10px] leading-none text-slate-400 hover:text-indigo-600">▼</button>
              </div>
              <input value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} className={field} />
              <button onClick={() => setCol(i, { masked: !c.masked })} title="遮住這個欄位" className={`shrink-0 rounded-lg px-2 py-1.5 text-sm ${c.masked ? "bg-amber-100" : "bg-slate-50 opacity-50 hover:opacity-100"}`}>🔒</button>
              <button
                onClick={() => (!isEdit || !c.key || confirm(`刪除欄位「${c.label}」？這個欄位的資料會看不到。`)) && setCols((cs) => cs.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-rose-50 hover:text-rose-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setCols((cs) => [...cs, { key: "", label: "" }])} className="mt-2 text-sm font-semibold text-indigo-600 hover:underline">＋ 新增欄位</button>
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 一筆資料 ---------- */
function RowModal({ table, initial, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id);
  const [d, setD] = useState(() => ({ ...(initial?.data || {}) }));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setErr("");
    try {
      if (isEdit) await updateRow(initial.id, d);
      else await createRow(table.id, d);
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("刪除這筆資料？")) return;
    await deleteRow(initial.id);
    onSaved();
  }
  return (
    <Modal
      title={`${table.emoji} ${table.name}・${isEdit ? "編輯" : "新增"}`}
      onClose={onClose}
      footer={
        <>
          {isEdit && <button onClick={remove} className={`${btn} text-rose-500 hover:bg-rose-50`}>刪除</button>}
          <div className="flex-1" />
          <button onClick={onClose} className={`${btn} text-slate-500 hover:bg-slate-100`}>取消</button>
          <button disabled={saving} onClick={save} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:opacity-40`}>{saving ? "儲存中…" : "儲存"}</button>
        </>
      }
    >
      {table.columns.map((c, i) => (
        <div key={c.key}>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            {c.label} {c.masked && <span className="text-amber-600">🔒</span>}
          </label>
          <textarea
            autoFocus={i === 0 && !isEdit}
            rows={Math.min(6, Math.max(1, String(d[c.key] || "").split("\n").length))}
            value={d[c.key] || ""}
            onChange={(e) => setD({ ...d, [c.key]: e.target.value })}
            className={`${field} resize-y`}
          />
        </div>
      ))}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 匯入 Excel ---------- */
function mergeContinuation(rows) {
  // 第一欄空白的列 → 併到上一筆（同一家公司的第二行聯絡人）
  const out = [];
  for (const r of rows) {
    if (!r[0] && out.length) {
      const prev = out[out.length - 1];
      r.forEach((v, j) => {
        if (v) prev[j] = prev[j] ? `${prev[j]}\n${v}` : v;
      });
    } else out.push([...r]);
  }
  return out;
}

function ImportModal({ caseObj, tables, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sheets, setSheets] = useState(null);
  const fileRef = useRef(null);

  async function pick(file) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const p = await previewImport(file);
      setSheets(p.sheets.map((s) => ({ ...s, use: s.header_found && s.rows.length > 0, name: s.title, merge: s.merge_default })));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const set = (i, patch) => setSheets((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const chosen = (sheets || []).filter((s) => s.use && s.name.trim());

  async function run() {
    setBusy(true);
    setErr("");
    try {
      const res = await commitImport(
        caseObj.id,
        chosen.map((s) => ({ name: s.name.trim(), columns: s.columns, rows: s.merge ? mergeContinuation(s.rows) : s.rows }))
      );
      onDone(res);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={`匯入 Excel 到「${caseObj.name}」`}
      onClose={onClose}
      footer={
        sheets && (
          <>
            <button onClick={() => setSheets(null)} className={`${btn} text-slate-500 hover:bg-slate-100`}>換檔案</button>
            <div className="flex-1" />
            <span className="text-xs text-slate-400">{chosen.length} 個工作表</span>
            <button disabled={busy || !chosen.length} onClick={run} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:opacity-40`}>{busy ? "匯入中…" : "匯入"}</button>
          </>
        )
      }
    >
      {!sheets ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">每個工作表會變成一個分類（自動抓標題列當欄位）。分類名稱一樣的會合併，例如「聯繫單1」「聯繫單2」都會進「客戶聯繫單」。</p>
          <button disabled={busy} onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 py-10 text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
            <span className="text-3xl">📥</span>
            <span className="text-sm font-semibold">{busy ? "讀取中…" : "選擇 .xlsx 檔案"}</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="space-y-2">
          <datalist id="work-table-names">{tables.map((t) => <option key={t.id} value={t.name} />)}</datalist>
          {sheets.map((s, i) => (
            <div key={s.sheet} className={`rounded-xl p-3 ring-1 ${s.use ? "bg-white ring-indigo-200" : "bg-slate-50 ring-slate-100"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <input type="checkbox" checked={s.use} onChange={(e) => set(i, { use: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                  {s.sheet}
                </label>
                <span className="text-xs text-slate-400">{s.rows.length} 列・{s.columns.length} 欄{!s.header_found && "・沒偵測到標題列"}</span>
                <span className="ml-auto text-xs text-slate-400">→ 分類</span>
                <input list="work-table-names" value={s.name} onChange={(e) => set(i, { name: e.target.value })} disabled={!s.use} className="w-40 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm disabled:opacity-50" />
              </div>
              {s.use && (
                <>
                  <p className="mt-1.5 truncate text-xs text-slate-500">欄位：{s.columns.join("、")}</p>
                  <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" checked={s.merge} onChange={(e) => set(i, { merge: e.target.checked })} className="h-3.5 w-3.5 accent-indigo-600" />
                    第一欄空白的列併到上一筆（同一家公司寫兩行的情況）
                    {s.merge && <span className="text-slate-400">→ {mergeContinuation(s.rows).length} 筆</span>}
                  </label>
                  {tables.some((t) => t.name === s.name.trim()) && (
                    <p className="mt-1 text-xs text-amber-600">已經有這個分類，會加在後面（重複匯入會變兩份）</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- 資料呈現：清單＋詳細（預設）或表格 ---------- */
const AVATAR = ["bg-indigo-100 text-indigo-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-teal-100 text-teal-700"];
const avatarCls = (name) => AVATAR[[...(name || "?")].reduce((s, ch) => s + ch.codePointAt(0), 0) % AVATAR.length];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http 網址沒有 clipboard API：用舊方法
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function Field({ col, value }) {
  const [copied, setCopied] = useState(false);
  const long = value.length > 36 || value.includes("\n");
  return (
    <div className={`group relative rounded-xl bg-slate-50/80 px-3.5 py-2.5 ring-1 ring-slate-100 ${long ? "sm:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold tracking-wide text-slate-400">
        {col.label} {col.masked && <span className="text-amber-500">🔒</span>}
      </p>
      <div className="mt-0.5 pr-8 text-sm leading-relaxed text-slate-800">
        {col.masked ? <Masked value={value} /> : <span className="whitespace-pre-line break-words">{value}</span>}
      </div>
      <button
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }
        }}
        className="absolute right-2 top-2 rounded-lg px-1.5 py-1 text-xs text-slate-400 opacity-0 transition hover:bg-white hover:text-indigo-600 group-hover:opacity-100 max-md:opacity-100"
        title="複製"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </div>
  );
}

function RecordDetail({ table, row, onEdit }) {
  const [first, ...rest] = table.columns;
  const filled = rest.filter((c) => (row.data[c.key] || "").trim());
  const empty = rest.length - filled.length;
  const name = row.data[first?.key] || "（未命名）";
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black ${avatarCls(name)}`}>{[...name][0]}</div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-xl font-black leading-tight text-slate-900">{name}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {table.emoji} {table.name}・{filled.length} 個欄位有資料{empty > 0 && `・${empty} 個空白`}
          </p>
        </div>
        <button onClick={() => onEdit(row)} className={`${btn} shrink-0 bg-indigo-600 text-white shadow hover:bg-indigo-700`}>✏️ 編輯</button>
      </div>
      {filled.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {filled.map((c) => <Field key={c.key} col={c} value={row.data[c.key]} />)}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">只有名稱，其他欄位都還沒填。按「編輯」補資料。</p>
      )}
    </div>
  );
}

function RecordsView({ table, rows, total, loading, filter, setFilter, onEdit, onAdd, onSettings }) {
  const [view, setView] = useState(() => store.get("dispatch.workView") || "list");
  const [selId, setSelId] = useState(null);
  const [sheet, setSheet] = useState(null); // 手機：點開的那筆
  const [first, ...rest] = table.columns;
  useEffect(() => store.set("dispatch.workView", view), [view]);
  useEffect(() => {
    if (!rows.some((r) => r.id === selId)) setSelId(rows[0]?.id ?? null);
  }, [rows, selId]);
  const sel = rows.find((r) => r.id === selId);
  const subtitle = (r) =>
    rest
      .filter((c) => !c.masked && (r.data[c.key] || "").trim())
      .slice(0, 2)
      .map((c) => r.data[c.key].split("\n")[0])
      .join("・");
  // 表格模式：目前這些資料裡全空的欄位就不顯示
  const usedCols = table.columns.filter((c, i) => i === 0 || rows.some((r) => (r.data[c.key] || "").trim()));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`在「${table.name}」裡篩選`} className={field} />
          {filter && <button onClick={() => setFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-slate-400">✕</button>}
        </div>
        <span className="text-xs text-slate-400">{rows.length === total ? `${total} 筆` : `${rows.length} / ${total} 筆`}</span>
        <div className="flex-1" />
        <div className="hidden rounded-xl bg-slate-100 p-0.5 text-xs font-semibold md:flex">
          {[["list", "☰ 清單"], ["table", "▦ 表格"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1.5 transition ${view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{label}</button>
          ))}
        </div>
        <button onClick={onSettings} className={`${btn} bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50`}>⚙ 欄位</button>
        <button onClick={onAdd} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700`}>＋ 新增</button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">載入中…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">{total ? "沒有符合的資料" : "這個分類還沒有資料"}</p>
      ) : view === "table" ? (
        <div className="hidden max-h-[calc(100vh-330px)] min-h-[300px] overflow-auto rounded-xl ring-1 ring-slate-200 md:block">
          <table className="w-max text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-100/95 text-left text-xs text-slate-500 backdrop-blur">
              <tr>
                {usedCols.map((c, i) => (
                  <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${i === 0 ? "sticky left-0 z-20 bg-slate-100" : ""}`}>
                    {c.label}{c.masked && " 🔒"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.id} onClick={() => onEdit(r)} className={`group cursor-pointer ${ri % 2 ? "bg-slate-50/60" : "bg-white"} hover:bg-indigo-50`}>
                  {usedCols.map((c, i) => (
                    <td key={c.key} title={c.masked ? "" : r.data[c.key] || ""}
                      className={`max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 ${i === 0 ? `sticky left-0 font-bold text-slate-800 ${ri % 2 ? "bg-slate-50" : "bg-white"} group-hover:bg-indigo-50` : "text-slate-600"}`}>
                      {c.masked ? (r.data[c.key] ? "••••" : "") : (r.data[c.key] || "").replace(/\n/g, "  ")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && rows.length > 0 && (
        <div className={`gap-4 ${view === "table" ? "md:hidden" : "lg:grid lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]"}`}>
          {/* 清單 */}
          <div className="space-y-1 p-px lg:max-h-[calc(100vh-330px)] lg:min-h-[300px] lg:overflow-y-auto lg:pr-1">
            {rows.map((r) => {
              const name = r.data[first?.key] || "（未命名）";
              const on = r.id === selId;
              return (
                <button key={r.id}
                  onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setSelId(r.id) : setSheet(r))}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? "lg:bg-indigo-50 lg:ring-1 lg:ring-indigo-200" : ""} hover:bg-slate-50`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${avatarCls(name)}`}>{[...name][0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-bold ${on ? "text-indigo-700" : "text-slate-800"}`}>{name}</span>
                    <span className="block truncate text-xs text-slate-400">{subtitle(r) || "—"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {/* 詳細（桌面） */}
          <div className="hidden p-px lg:block lg:max-h-[calc(100vh-330px)] lg:overflow-y-auto">
            {sel && (
              <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                <RecordDetail table={table} row={sel} onEdit={onEdit} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 詳細（手機：底部彈出） */}
      {sheet && (
        <Modal title={`${table.emoji} ${table.name}`} onClose={() => setSheet(null)}>
          <RecordDetail table={table} row={rows.find((r) => r.id === sheet.id) || sheet} onEdit={(r) => { setSheet(null); onEdit(r); }} />
        </Modal>
      )}
    </>
  );
}

/* ---------- 主頁 ---------- */
export default function WorkVendors() {
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(() => Number(store.get("dispatch.workCase")) || null);
  const [tables, setTables] = useState([]);
  const [tableId, setTableId] = useState(() => Number(store.get("dispatch.workTable")) || null);
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [modal, setModal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  const caseObj = cases?.find((c) => c.id === caseId) || null;
  const table = tables.find((t) => t.id === tableId) || null;

  function loadCases(selectId) {
    return listCases()
      .then((cs) => {
        setCases(cs);
        const want = selectId ?? caseId;
        const pick = cs.find((c) => c.id === want) || cs.find((c) => !c.archived) || cs[0];
        setCaseId(pick?.id ?? null);
      })
      .catch((e) => {
        setCases([]);
        setErr(errMsg(e));
      });
  }
  function loadTables(selectId) {
    if (!caseId) return setTables([]);
    return listTables(caseId).then((ts) => {
      setTables(ts);
      const want = selectId ?? tableId;
      setTableId((ts.find((t) => t.id === want) || ts[0])?.id ?? null);
    });
  }
  function loadRows() {
    if (!tableId) return setRows([]);
    setLoadingRows(true);
    listRows(tableId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoadingRows(false));
  }

  useEffect(() => {
    loadCases();
  }, []);
  useEffect(() => {
    if (caseId) store.set("dispatch.workCase", String(caseId));
    setQ("");
    setResults(null);
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);
  useEffect(() => {
    if (tableId) store.set("dispatch.workTable", String(tableId));
    setFilter("");
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // 整個案子搜尋（跨分類）
  useEffect(() => {
    if (!caseId || !q.trim()) return setResults(null);
    const t = setTimeout(() => searchCase(caseId, q).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q, caseId]);

  const shownRows = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !table) return rows;
    const masked = new Set(table.columns.filter((c) => c.masked).map((c) => c.key));
    return rows.filter((r) => {
      const text = Object.entries(r.data).filter(([k]) => !masked.has(k)).map(([, v]) => v).join(" ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [rows, filter, table]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  const active = (cases || []).filter((c) => !c.archived);
  const archived = (cases || []).filter((c) => c.archived);

  if (cases === null) return <p className="py-16 text-center text-sm text-slate-400">載入中…</p>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">🏢 廠商紀錄</h1>
          <p className="text-xs text-slate-400">一間公司一個案子；換工作就開新案子，舊的封存</p>
        </div>
        {caseObj && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal({ type: "import" })} className={`${btn} bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50`}>📥 匯入 Excel</button>
            <button onClick={() => setModal({ type: "case" })} className={`${btn} bg-indigo-600 text-white shadow hover:bg-indigo-700`}>＋ 案子</button>
          </div>
        )}
      </div>
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</p>}

      {cases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-4xl">🏢</p>
          <p className="mt-2 font-bold text-slate-800">先建立第一個案子</p>
          <p className="mt-1 text-sm text-slate-500">用目前的公司名稱就好（例：中程資訊），之後可以匯入 Excel。</p>
          <button onClick={() => setModal({ type: "case" })} className={`${btn} mt-4 bg-indigo-600 text-white shadow hover:bg-indigo-700`}>＋ 建立案子</button>
        </div>
      ) : (
        <>
          {/* 案子切換 */}
          <div className="flex flex-wrap items-center gap-2">
            {active.map((c) => (
              <button key={c.id} onClick={() => setCaseId(c.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold shadow-sm ring-1 transition ${c.id === caseId ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:ring-indigo-300"}`}>
                {c.emoji} {c.name}
                <span className={`text-xs font-medium ${c.id === caseId ? "text-slate-400" : "text-slate-400"}`}>{c.row_count}</span>
              </button>
            ))}
            {archived.length > 0 && (
              <button onClick={() => setShowArchived((v) => !v)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600">
                🗄 封存的案子 {archived.length} {showArchived ? "▴" : "▾"}
              </button>
            )}
            {showArchived && archived.map((c) => (
              <button key={c.id} onClick={() => setCaseId(c.id)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${c.id === caseId ? "bg-slate-600 text-white ring-slate-600" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>

          {caseObj && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">{caseObj.emoji} {caseObj.name}</h2>
                {caseObj.archived && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-500">已封存</span>}
                <button onClick={() => setModal({ type: "case", initial: caseObj })} className="text-xs text-slate-400 hover:text-indigo-600">✏️ 編輯</button>
                {caseObj.note && <span className="w-full text-xs text-slate-400 sm:w-auto">{caseObj.note}</span>}
                <div className="relative ml-auto w-full sm:w-72">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋整個案子（公司、電話、聯絡人…）" className={field} />
                  {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-slate-400">✕</button>}
                </div>
              </div>

              {results ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-400">找到 {results.length} 筆{results.length >= 200 && "（只顯示前 200 筆）"}</p>
                  {results.map(({ table_id, table_name, table_emoji, row }) => {
                    const t = tables.find((x) => x.id === table_id);
                    if (!t) return null;
                    return (
                      <button key={`${table_id}-${row.id}`} onClick={() => setModal({ type: "row", table: t, initial: row })} className="block w-full rounded-xl bg-slate-50 px-3 py-2 text-left hover:bg-indigo-50">
                        <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">{table_emoji} {table_name}</span>
                        {t.columns.filter((c) => !c.masked && row.data[c.key]).slice(0, 5).map((c, i) => (
                          <span key={c.key} className={`mr-3 text-sm ${i === 0 ? "font-bold text-slate-800" : "text-slate-600"}`}>
                            {i > 0 && <span className="text-xs text-slate-400">{c.label} </span>}
                            {row.data[c.key].replace(/\n/g, "  ")}
                          </span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* 分類 */}
                  <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                    {tables.map((t) => (
                      <button key={t.id} onClick={() => setTableId(t.id)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${t.id === tableId ? "bg-indigo-600 text-white shadow" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"}`}>
                        {t.emoji} {t.name} <span className="text-xs opacity-70">{t.row_count}</span>
                      </button>
                    ))}
                    <button onClick={() => setModal({ type: "table" })} className="shrink-0 rounded-full border border-dashed border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-slate-400 hover:border-indigo-300 hover:text-indigo-600">＋ 分類</button>
                  </div>

                  {tables.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">
                      還沒有分類。可以按「📥 匯入 Excel」，或「＋ 分類」自己建。
                    </div>
                  ) : table && (
                    <>
                      <RecordsView
                        table={table}
                        rows={shownRows}
                        total={rows.length}
                        loading={loadingRows}
                        filter={filter}
                        setFilter={setFilter}
                        onEdit={(r) => setModal({ type: "row", table, initial: r })}
                        onAdd={() => setModal({ type: "row", table, initial: null })}
                        onSettings={() => setModal({ type: "table", initial: table })}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xl md:bottom-8">{toast}</div>}

      {modal?.type === "case" && (
        <CaseModal
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={(c) => {
            setModal(null);
            loadCases(c?.id ?? null);
          }}
        />
      )}
      {modal?.type === "table" && (
        <TableModal
          caseId={caseId}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={(t) => {
            setModal(null);
            loadTables(t?.id ?? null);
            if (t?.id === tableId) loadRows();
          }}
        />
      )}
      {modal?.type === "row" && (
        <RowModal
          table={modal.table}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            loadRows();
            loadTables(tableId);
            loadCases(caseId);
            if (q.trim()) searchCase(caseId, q).then(setResults).catch(() => {});
          }}
        />
      )}
      {modal?.type === "import" && caseObj && (
        <ImportModal
          caseObj={caseObj}
          tables={tables}
          onClose={() => setModal(null)}
          onDone={(res) => {
            setModal(null);
            flash(`匯入完成：${res.tables.map((t) => `${t.name} ${t.rows} 筆`).join("、")}`);
            loadCases(caseId);
            listTables(caseId).then((ts) => {
              setTables(ts);
              const first = ts.find((t) => t.name === res.tables[0]?.name) || ts[0];
              if (first?.id === tableId) loadRows();
              else setTableId(first?.id ?? null);
            });
          }}
        />
      )}
    </div>
  );
}
