import { useEffect, useState } from "react";
import { getPref, setPref } from "../api/prefs";

// 新增／編輯行程的「常用時段」：按一下帶入開始～結束時間，可自己新增、編輯、刪除
const KEY = "event_time_presets";
const DEFAULT = [{ label: "中午", start: "12:00", end: "13:00" }];
let cache = null; // 同一次開網頁內共用，開視窗不用每次等

const hm = (s) => (s || "").slice(11, 16);
const toMin = (t) => {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return h * 60 + m;
};
function addDays(ds, n) {
  const d = new Date(`${ds}T00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const tag = (p) => `${p.start}–${p.end}`;

export default function TimePresets({ form, setForm }) {
  const [presets, setPresets] = useState(cache || DEFAULT);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getPref(KEY, DEFAULT).then((v) => {
      cache = Array.isArray(v) ? v : DEFAULT;
      setPresets(cache);
    });
  }, []);

  function apply(p) {
    setForm((f) => {
      const day = (f.start_time || "").slice(0, 10);
      const endDay = toMin(p.end) <= toMin(p.start) ? addDays(day, 1) : day; // 跨午夜
      return { ...f, all_day: false, start_time: `${day}T${p.start}`, end_time: `${endDay}T${p.end}` };
    });
  }
  const isCurrent = (p) => !form.all_day && hm(form.start_time) === p.start && hm(form.end_time) === p.end;

  function startEdit() {
    setDraft(presets.map((p) => ({ ...p })));
    setErr("");
    setEditing(true);
  }
  async function save(list) {
    const clean = list
      .map((p) => ({ label: (p.label || "").trim().slice(0, 12), start: p.start, end: p.end }))
      .filter((p) => /^\d{2}:\d{2}$/.test(p.start) && /^\d{2}:\d{2}$/.test(p.end));
    if (clean.some((p) => p.start === p.end)) return setErr("開始和結束時間不能一樣");
    setSaving(true);
    setErr("");
    try {
      const v = await setPref(KEY, clean);
      cache = v;
      setPresets(v);
      setEditing(false);
    } catch (e) {
      setErr(e?.response?.data?.detail || "儲存失敗");
    } finally {
      setSaving(false);
    }
  }
  // 把目前選的時間存成一個常用時段
  const cur = !form.all_day && hm(form.start_time) && hm(form.end_time) ? { label: "", start: hm(form.start_time), end: hm(form.end_time) } : null;
  const curSaved = cur && presets.some((p) => p.start === cur.start && p.end === cur.end);

  const chip = "rounded-lg border px-2.5 py-1 text-xs font-medium transition active:scale-95";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold text-slate-500">常用時段</span>
        {presets.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => apply(p)}
            title={`帶入 ${tag(p)}`}
            className={`${chip} ${isCurrent(p) ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"}`}
          >
            {p.label ? `${p.label} ` : ""}
            <span className={isCurrent(p) ? "text-indigo-100" : "text-slate-400"}>{tag(p)}</span>
          </button>
        ))}
        {cur && !curSaved && !editing && (
          <button type="button" onClick={() => save([...presets, cur])} className={`${chip} border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-600`} title="把目前的開始～結束時間存成常用時段">
            ＋ 存 {tag(cur)}
          </button>
        )}
        <button type="button" onClick={() => (editing ? setEditing(false) : startEdit())} className="rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title="編輯常用時段">
          {editing ? "收起" : "⚙"}
        </button>
      </div>

      {editing && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] text-slate-400">名稱可留空（例：午休、晨會）；結束比開始早代表跨到隔天</p>
          {draft.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={p.label}
                onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder="名稱"
                className="w-20 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-400 sm:w-24"
              />
              <input type="time" value={p.start} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="min-w-0 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs" />
              <span className="text-xs text-slate-400">～</span>
              <input type="time" value={p.end} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="min-w-0 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs" />
              <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="ml-auto shrink-0 rounded-lg px-1.5 py-1 text-xs text-slate-300 hover:bg-rose-50 hover:text-rose-500" title="刪除">✕</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => setDraft((d) => [...d, { label: "", start: "09:00", end: "10:00" }])} className="text-xs font-semibold text-indigo-600 hover:underline">＋ 新增時段</button>
            <div className="flex-1" />
            {err && <span className="text-xs text-rose-500">{err}</span>}
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white">取消</button>
            <button type="button" disabled={saving} onClick={() => save(draft)} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "儲存中…" : "儲存"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
