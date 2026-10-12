import { useEffect, useState } from "react";
import { getSummary } from "../api/analytics";
import { errorMessage } from "../api/client";
import { createPillar, deletePillar, listPillars, updatePillar } from "../api/pillars";
import { PILLAR_COLORS, nextPillarColor } from "../lib/content";

const emptyForm = {
  name: "",
  description: "",
  audience: "",
  tone: "",
  color: PILLAR_COLORS[0],
  target_ratio: 0,
};

const inputClass = "w-full rounded-md border px-3 py-2 text-sm";
const labelClass = "mb-1 block text-xs font-medium text-gray-500";

export default function Pillars() {
  const [pillars, setPillars] = useState([]);
  const [mix, setMix] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() {
    try {
      const [list, summary] = await Promise.all([listPillars(), getSummary()]);
      setPillars(list);
      setMix(Object.fromEntries(summary.by_pillar.map((r) => [r.pillar_id, r])));
      if (editingId === null) setForm({ ...emptyForm, color: nextPillarColor(list) });
    } catch {
      setError("讀取失敗，請確認 backend 是否啟動。");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetTotal = pillars.reduce(
    (sum, p) => sum + (p.id === editingId ? Number(form.target_ratio) || 0 : p.target_ratio),
    editingId === null ? Number(form.target_ratio) || 0 : 0
  );

  function startEdit(pillar) {
    setEditingId(pillar.id);
    setForm({ ...emptyForm, ...pillar });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...emptyForm, color: nextPillarColor(pillars) });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      description: form.description,
      audience: form.audience,
      tone: form.tone,
      color: form.color,
      target_ratio: Number(form.target_ratio) || 0,
    };
    try {
      if (editingId) await updatePillar(editingId, payload);
      else await createPillar(payload);
      setEditingId(null);
      setError(null);
      const list = await listPillars();
      setForm({ ...emptyForm, color: nextPillarColor(list) });
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDelete(pillar) {
    if (!window.confirm(`刪除「${pillar.name}」？這個主題下的貼文會變成未分類。`)) return;
    await deletePillar(pillar.id);
    if (editingId === pillar.id) cancelEdit();
    refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">{editingId ? "編輯主題方向" : "新增主題方向"}</h2>
        <p className="mb-3 text-sm text-gray-500">
          主題方向（content pillar）是你的帳號固定會經營的幾個題材。設定目標比例，
          就能在數據分析看到實際發文有沒有偏離方向。
        </p>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>名稱</label>
            <input
              className={inputClass}
              placeholder="例如：知識分享"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>目標比例（%）</label>
            <input
              type="number"
              min="0"
              max="100"
              className={inputClass}
              value={form.target_ratio}
              onChange={(e) => setForm({ ...form, target_ratio: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>方向說明：這個主題要傳達什麼？</label>
            <textarea
              rows={2}
              className={inputClass}
              placeholder="例如：把自己會的東西拆成好懂的小知識，建立專業感"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>目標受眾</label>
            <input
              className={inputClass}
              placeholder="例如：想學新技能的上班族"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>語氣風格</label>
            <input
              className={inputClass}
              placeholder="例如：輕鬆、真誠、像朋友聊天"
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>顏色</label>
            <div className="flex gap-2">
              {PILLAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full ring-offset-2 ${
                    form.color === c ? "ring-2 ring-gray-800" : ""
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="flex items-end justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              >
                取消
              </button>
            )}
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {editingId ? "儲存" : "新增"}
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">我的主題方向</h2>
          {pillars.length > 0 && (
            <p className={`text-sm ${targetTotal === 100 ? "text-gray-500" : "text-amber-700"}`}>
              目標比例合計 {targetTotal}%{targetTotal !== 100 && "（建議調整到 100%）"}
            </p>
          )}
        </div>
        {pillars.length === 0 ? (
          <p className="text-sm text-gray-400">
            還沒有主題方向。建議先定 3–5 個，例如「知識分享 / 生活日常 / 經驗心得 / 互動活動」。
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pillars.map((p) => {
              const row = mix[p.id];
              const actual = row?.actual_ratio ?? 0;
              const gap = actual - p.target_ratio;
              return (
                <li key={p.id} className="rounded-lg border p-4" style={{ borderTop: `4px solid ${p.color}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {p.audience && <>受眾：{p.audience}　</>}
                    {p.tone && <>語氣：{p.tone}</>}
                  </p>

                  {/* Actual share as a bar, target as a tick on the same track. */}
                  <div className="mt-3">
                    <div className="relative h-2.5 rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(actual, 100)}%`, background: p.color }}
                      />
                      {p.target_ratio > 0 && (
                        <div
                          className="absolute -top-1 h-[18px] w-0.5 bg-gray-800"
                          style={{ left: `calc(${Math.min(p.target_ratio, 100)}% - 1px)` }}
                          title={`目標 ${p.target_ratio}%`}
                        />
                      )}
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-gray-500">
                      <span>
                        全部期間實際 {actual}%（{row?.posts ?? 0} 篇）· 目標 {p.target_ratio}%
                      </span>
                      {p.target_ratio > 0 && row?.posts > 0 && Math.abs(gap) >= 5 && (
                        <span className="font-medium text-amber-700">
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
      </section>
    </div>
  );
}
