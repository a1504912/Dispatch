// 行程的自訂提醒：提前多久或指定時間，文字自己寫（空白就用標題），可以加很多個
const UNITS = [
  [1, "分鐘"],
  [60, "小時"],
  [1440, "天"],
];
const pad = (n) => String(n).padStart(2, "0");
const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const newId = () => Math.random().toString(36).slice(2, 10);

// 開始前 N 分鐘拆成「數字＋單位」（能整除就用大的單位）
function split(minutes) {
  const m = Number(minutes) || 0;
  if (m && m % 1440 === 0) return [m / 1440, 1440];
  if (m && m % 60 === 0) return [m / 60, 60];
  return [m, 1];
}

// 算出提醒觸發時間（整天行程以當天 09:00 為基準，跟主機排程一致）
export function reminderTime(r, form) {
  if (r.mode === "at") return r.at ? new Date(r.at) : null;
  const s = form.start_time ? new Date(form.all_day ? `${form.start_time.slice(0, 10)}T09:00` : form.start_time) : null;
  if (!s || Number.isNaN(s.getTime())) return null;
  return new Date(s.getTime() - (Number(r.minutes) || 0) * 60000);
}

export default function EventReminders({ form, setForm }) {
  const list = form.reminders || [];
  const set = (next) => setForm((f) => ({ ...f, reminders: next }));
  const upd = (i, patch) => set(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (r) => set([...list, { id: newId(), text: "", ...r }]);
  const fmt = (d) =>
    d && !Number.isNaN(d.getTime())
      ? `${d.getMonth() + 1}/${d.getDate()}（${"日一二三四五六"[d.getDay()]}）${pad(d.getHours())}:${pad(d.getMinutes())}`
      : "—";
  const now = Date.now();
  const inputCls = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400";

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-slate-500">🔔 提醒</label>
      <div className="space-y-2">
        {list.map((r, i) => {
          const [num, unit] = split(r.minutes);
          const t = reminderTime(r, form);
          const past = t && t.getTime() < now;
          return (
            <div key={r.id} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={r.mode} onChange={(e) => upd(i, e.target.value === "at" ? { mode: "at", at: r.at || (t ? toLocal(t) : "") } : { mode: "before", minutes: r.minutes ?? 10 })} className={inputCls}>
                  <option value="before">開始前</option>
                  <option value="at">指定時間</option>
                </select>
                {r.mode === "at" ? (
                  <input type="datetime-local" value={r.at || ""} onChange={(e) => upd(i, { at: e.target.value })} className={inputCls} />
                ) : (
                  <>
                    <input type="number" min="0" value={num} onChange={(e) => upd(i, { minutes: Math.max(0, Number(e.target.value) || 0) * unit })} className={`${inputCls} w-16`} />
                    <select value={unit} onChange={(e) => upd(i, { minutes: num * Number(e.target.value) })} className={inputCls}>
                      {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </>
                )}
                <span className={`text-xs ${past ? "text-slate-300 line-through" : "text-slate-400"}`}>→ {fmt(t)}</span>
                <button type="button" onClick={() => set(list.filter((_, j) => j !== i))} className="ml-auto rounded-lg px-1.5 text-slate-300 hover:text-rose-500" title="刪除這個提醒">✕</button>
              </div>
              <input
                value={r.text || ""}
                onChange={(e) => upd(i, { text: e.target.value })}
                placeholder={`提醒文字（不填就用標題：${form.title || "…"}）`}
                className={`${inputCls} mt-1.5 w-full`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {[
          ["提前 10 分", { mode: "before", minutes: 10 }],
          ["提前 1 小時", { mode: "before", minutes: 60 }],
          ["前一天", { mode: "before", minutes: 1440 }],
          ["指定時間", { mode: "at", at: "" }],
        ].map(([label, r]) => (
          <button key={label} type="button" onClick={() => add(r)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
            ＋ {label}
          </button>
        ))}
      </div>
      {form.all_day && list.some((r) => r.mode !== "at") && <p className="mt-1 text-[11px] text-slate-400">整天行程的「開始前」以當天早上 9:00 起算</p>}
    </div>
  );
}
