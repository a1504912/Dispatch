import { useEffect, useState } from "react";
import { deletePillar, getAnalytics, listPillars, savePillar } from "../api/media";
import { PILLAR_COLORS, errMsg, field, nextPillarColor } from "../mediaConst";

const empty = { name: "", description: "", audience: "", tone: "", color: PILLAR_COLORS[0], target_ratio: 0 };
const label = "mb-1 block text-xs font-semibold text-slate-500";

export default function MediaPillars() {
  const [pillars, setPillars] = useState([]);
  const [mix, setMix] = useState({});
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(resetForm = false) {
    try {
      const [list, a] = await Promise.all([listPillars(), getAnalytics()]);
      setPillars(list);
      setMix(Object.fromEntries(a.by_pillar.map((r) => [r.pillar_id, r])));
      if (resetForm) setForm({ ...empty, color: nextPillarColor(list) });
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  const editing = Boolean(form.id);
  const targetTotal =
    pillars.reduce((sum, p) => sum + (p.id === form.id ? 0 : p.target_ratio), 0) + (Number(form.target_ratio) || 0);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setErr("主題名稱不能空白");
    setSaving(true);
    try {
      await savePillar({ ...form, target_ratio: Number(form.target_ratio) || 0 });
      setErr("");
      await load(true);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p) {
    if (!confirm(`刪除「${p.name}」？這個主題下的貼文會變成未分類。`)) return;
    await deletePillar(p.id);
    await load(form.id === p.id);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">🧭 自媒體・主題方向</h1>
        <p className="text-xs text-slate-400">帳號固定經營的幾個題材（content pillar）。設好目標比例，就能看出實際發文有沒有偏離方向。</p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-black text-slate-900">{editing ? `編輯「${form.name || "主題"}」` : "＋ 新增主題方向"}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_10rem]">
          <div>
            <label className={label}>名稱</label>
            <input className={field} placeholder="例如：知識分享" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={label}>目標比例（%）</label>
            <input
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              className={field}
              value={form.target_ratio}
              onChange={(e) => setForm({ ...form, target_ratio: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className={label}>方向說明：這個主題要傳達什麼？</label>
          <textarea
            rows={2}
            className={field}
            placeholder="例如：把自己會的東西拆成好懂的小知識，建立專業感"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={label}>目標受眾</label>
            <input className={field} placeholder="例如：想學新技能的上班族" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          </div>
          <div>
            <label className={label}>語氣風格</label>
            <input className={field} placeholder="例如：輕鬆、真誠、像朋友聊天" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className={label}>顏色</label>
            <div className="flex flex-wrap gap-2">
              {PILLAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full ring-offset-2 ${form.color === c ? "ring-2 ring-slate-800" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={() => setForm({ ...empty, color: nextPillarColor(pillars) })} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                取消
              </button>
            )}
            <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-40">
              {saving ? "儲存中…" : editing ? "儲存" : "新增"}
            </button>
          </div>
        </div>
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-black text-slate-900">
            我的主題方向 <span className="text-sm font-medium text-slate-400">{pillars.length} 個</span>
          </h2>
          {pillars.length > 0 && (
            <p className={`text-sm font-semibold ${targetTotal === 100 ? "text-slate-500" : "text-amber-700"}`}>
              目標比例合計 {targetTotal}%{targetTotal !== 100 && "（建議調整到 100%）"}
            </p>
          )}
        </div>
        {pillars.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            還沒有主題方向。建議先定 3–5 個，例如「知識分享 / 生活日常 / 經驗心得 / 互動活動」
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pillars.map((p) => {
              const row = mix[p.id];
              const actual = row?.actual_ratio ?? 0;
              const gap = actual - p.target_ratio;
              return (
                <li key={p.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" style={{ borderTop: `4px solid ${p.color}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-slate-900">{p.name}</p>
                      {p.description && <p className="text-sm text-slate-600">{p.description}</p>}
                      {(p.audience || p.tone) && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {p.audience && <>受眾：{p.audience}　</>}
                          {p.tone && <>語氣：{p.tone}</>}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => setForm({ ...empty, ...p })} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">編輯</button>
                      <button onClick={() => remove(p)} className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50">刪除</button>
                    </div>
                  </div>
                  {/* 長條＝實際佔比，黑色刻度＝目標 */}
                  <div className="mt-3">
                    <div className="relative h-2.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(actual, 100)}%`, background: p.color }} />
                      {p.target_ratio > 0 && (
                        <div className="absolute -top-1 h-[18px] w-0.5 bg-slate-800" style={{ left: `calc(${Math.min(p.target_ratio, 100)}% - 1px)` }} />
                      )}
                    </div>
                    <div className="mt-1.5 flex justify-between gap-2 text-xs text-slate-500">
                      <span>
                        全部期間實際 {actual}%（{row?.posts ?? 0} 篇）· 目標 {p.target_ratio}%
                      </span>
                      {p.target_ratio > 0 && row?.posts > 0 && Math.abs(gap) >= 5 && (
                        <span className="shrink-0 font-bold text-amber-700">
                          {gap > 0 ? `▲ 多了 ${gap.toFixed(0)}%` : `▼ 少了 ${(-gap).toFixed(0)}%`}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
