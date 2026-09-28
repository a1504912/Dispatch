import { useEffect, useMemo, useState } from "react";
import { addLog, deleteLog, getDay, getMonth, getWeights, saveHealthSettings } from "../api/health";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(s, n) {
  const d = new Date(s + "T00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowHM() {
  return new Date().toTimeString().slice(0, 5);
}
const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

const MEALS = [
  ["breakfast", "早餐"],
  ["lunch", "午餐"],
  ["dinner", "晚餐"],
  ["snack", "點心"],
];
const mealLabel = (m) => MEALS.find(([k]) => k === m)?.[1] || "其他";

function Card({ title, emoji, right, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-black text-slate-900">
          {emoji} {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ---------- 體重趨勢小圖 ---------- */
function Sparkline({ series, goal }) {
  if (!series || series.length < 2) return null;
  const w = 260;
  const h = 60;
  const vals = series.map((s) => s.weight);
  let min = Math.min(...vals, ...(goal ? [goal] : []));
  let max = Math.max(...vals, ...(goal ? [goal] : []));
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const x = (i) => (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v) => h - ((v - min) / (max - min)) * h;
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.weight).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-16 w-full" preserveAspectRatio="none">
      {goal != null && (
        <line x1="0" y1={y(goal)} x2={w} y2={y(goal)} stroke="#a7f3d0" strokeWidth="1.5" strokeDasharray="4 4" />
      )}
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {series.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s.weight)} r="2.5" fill="#6366f1" />
      ))}
    </svg>
  );
}

/* ---------- 月曆 ---------- */
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function MonthCalendar({ month, days, waterGoal, selected, onPickDay, onPrev, onNext, onToday }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = first.getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayIso = todayStr();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const label = `${y} 年 ${m} 月`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-center gap-1">
        <button onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">‹</button>
        <span className="min-w-[7rem] text-center text-sm font-black text-slate-800">{label}</span>
        <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">›</button>
        <button onClick={onToday} className="ml-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-100">本月</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const info = days[iso];
          const dayNum = Number(iso.slice(8, 10));
          const isToday = iso === todayIso;
          const isSel = iso === selected;
          const waterHit = info && waterGoal && info.water_total >= waterGoal;
          return (
            <button
              key={iso}
              onClick={() => onPickDay(iso)}
              className={`flex min-h-[70px] flex-col rounded-lg border p-1 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 ${
                isSel
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : isToday
                    ? "border-indigo-300 bg-indigo-50/50"
                    : "border-slate-100 bg-white"
              }`}
            >
              <span className={`text-[11px] font-bold ${isToday ? "text-indigo-600" : "text-slate-500"}`}>{dayNum}</span>
              {info && (
                <span className="mt-0.5 flex flex-col gap-0.5 text-[10px] leading-tight">
                  {info.weight != null && <span className="font-bold text-slate-700">{info.weight}kg</span>}
                  {info.food_calories > 0 && <span className="text-rose-500">🔥{info.food_calories}</span>}
                  {info.water_total > 0 && (
                    <span className={waterHit ? "text-sky-600" : "text-sky-400"}>
                      💧{info.water_total >= 1000 ? (info.water_total / 1000).toFixed(1) + "L" : info.water_total}
                    </span>
                  )}
                  {info.has_exercise && <span className="text-emerald-600">🏃{info.exercise_calories > 0 ? info.exercise_calories : ""}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Health() {
  const [day, setDay] = useState(todayStr());
  const [data, setData] = useState(null);
  const [weights, setWeights] = useState({ series: [], goal: null });
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [monthData, setMonthData] = useState({ days: {}, water_goal: 2000 });

  // 輸入狀態
  const [weightInput, setWeightInput] = useState("");
  const [waterInput, setWaterInput] = useState("");
  const [food, setFood] = useState({ name: "", meal: "breakfast", calories: "" });
  const [ex, setEx] = useState({ name: "", duration: "", calories: "" });

  function loadMonth(mo = month) {
    getMonth(mo)
      .then(setMonthData)
      .catch(() => setMonthData({ days: {}, water_goal: 2000 }));
  }

  function load() {
    setLoading(true);
    Promise.all([getDay(day), getWeights(90)])
      .then(([d, w]) => {
        setData(d);
        setWeights(w);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    loadMonth(); // 同步更新月曆
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // 選到的日期換月時，月曆跟著切到那個月
  useEffect(() => {
    setMonth(day.slice(0, 7));
  }, [day]);
  // 手動切換月曆月份時載入該月
  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function shiftMonth(mo, n) {
    const [yy, mm] = mo.split("-").map(Number);
    const d = new Date(yy, mm - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  async function logWeight() {
    const v = Number(weightInput);
    if (!v || v <= 0) return;
    await addLog({ kind: "weight", date: day, weight: v, time: nowHM() });
    setWeightInput("");
    load();
  }
  async function addWater(ml) {
    if (!ml || ml <= 0) return;
    await addLog({ kind: "water", date: day, amount: ml, time: nowHM() });
    load();
  }
  async function addFood() {
    if (!food.name.trim()) return;
    await addLog({
      kind: "food",
      date: day,
      name: food.name.trim(),
      meal: food.meal,
      calories: food.calories === "" ? null : Number(food.calories),
      time: nowHM(),
    });
    setFood({ name: "", meal: food.meal, calories: "" });
    load();
  }
  async function addExercise() {
    if (!ex.name.trim()) return;
    await addLog({
      kind: "exercise",
      date: day,
      name: ex.name.trim(),
      duration: ex.duration === "" ? null : Number(ex.duration),
      calories: ex.calories === "" ? null : Number(ex.calories),
      time: nowHM(),
    });
    setEx({ name: "", duration: "", calories: "" });
    load();
  }
  async function remove(id) {
    await deleteLog(id);
    load();
  }
  async function setWaterGoal() {
    const v = prompt("每日喝水目標（毫升）", String(data?.water_goal || 2000));
    if (v == null) return;
    const n = Number(v);
    if (n > 0) {
      await saveHealthSettings({ water_goal: Math.round(n) });
      load();
    }
  }
  async function setWeightGoal() {
    const v = prompt("目標體重（公斤，留空清除）", weights.goal ? String(weights.goal) : "");
    if (v == null) return;
    await saveHealthSettings({ weight_goal: v.trim() === "" ? 0 : Number(v) });
    load();
  }

  const weightDelta = useMemo(() => {
    const s = weights.series;
    if (!s || s.length < 2) return null;
    return s[s.length - 1].weight - s[s.length - 2].weight;
  }, [weights]);

  const waterPct = data && data.water_goal ? Math.min(100, Math.round((data.water_total / data.water_goal) * 100)) : 0;
  const netCal = data ? (data.food_calories || 0) - (data.exercise_calories || 0) : 0;

  const isToday = day === todayStr();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">健康</h1>
          <p className="mt-1 text-sm text-slate-500">記錄體重、飲食、喝水與運動。</p>
        </div>
        {/* 日期切換 */}
        <div className="flex items-center gap-1">
          <button onClick={() => setDay((d) => addDays(d, -1))} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">‹</button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 outline-none" />
          <button onClick={() => setDay((d) => addDays(d, 1))} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">›</button>
          {!isToday && (
            <button onClick={() => setDay(todayStr())} className="ml-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-100">今天</button>
          )}
        </div>
      </div>

      {/* 月曆：點某天切到那天 */}
      <MonthCalendar
        month={month}
        days={monthData.days || {}}
        waterGoal={monthData.water_goal}
        selected={day}
        onPickDay={(iso) => setDay(iso)}
        onPrev={() => setMonth((mo) => shiftMonth(mo, -1))}
        onNext={() => setMonth((mo) => shiftMonth(mo, 1))}
        onToday={() => setMonth(todayStr().slice(0, 7))}
      />

      {loading && !data ? (
        <p className="py-16 text-center text-sm text-slate-400">載入中…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 體重 */}
          <Card
            title="體重"
            emoji="⚖️"
            right={
              <button onClick={setWeightGoal} className="text-xs text-slate-400 hover:text-indigo-600">
                目標 {weights.goal ? `${weights.goal} kg` : "設定"}
              </button>
            }
          >
            <div className="flex items-end gap-2">
              <span className="text-3xl font-black text-slate-900">{data?.weight != null ? data.weight : "—"}</span>
              <span className="pb-1 text-sm text-slate-400">kg</span>
              {weightDelta != null && (
                <span className={`pb-1 text-xs font-bold ${weightDelta > 0 ? "text-rose-500" : weightDelta < 0 ? "text-emerald-600" : "text-slate-400"}`}>
                  {weightDelta > 0 ? "▲" : weightDelta < 0 ? "▼" : ""}
                  {Math.abs(weightDelta).toFixed(1)}
                </span>
              )}
              {data?.weight_id && (
                <button onClick={() => remove(data.weight_id)} className="ml-auto pb-1 text-xs text-slate-300 hover:text-red-500">刪除</button>
              )}
            </div>
            <Sparkline series={weights.series} goal={weights.goal} />
            <div className="mt-3 flex gap-2">
              <input type="number" inputMode="decimal" step="0.1" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logWeight()} placeholder="輸入今日體重" className={field} />
              <button onClick={logWeight} disabled={!Number(weightInput)} className="shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">記錄</button>
            </div>
          </Card>

          {/* 喝水 */}
          <Card
            title="喝水"
            emoji="💧"
            right={
              <button onClick={setWaterGoal} className="text-xs text-slate-400 hover:text-indigo-600">
                目標 {data?.water_goal} ml
              </button>
            }
          >
            <div className="flex items-end justify-between">
              <span className="text-3xl font-black text-sky-600">
                {data?.water_total || 0}
                <span className="ml-1 text-sm font-medium text-slate-400">/ {data?.water_goal} ml</span>
              </span>
              <span className="text-sm font-bold text-slate-500">{waterPct}%</span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${waterPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[250, 500, 700].map((ml) => (
                <button key={ml} onClick={() => addWater(ml)} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700 hover:bg-sky-100 active:scale-95">
                  +{ml}
                </button>
              ))}
              <div className="flex gap-1">
                <input type="number" inputMode="numeric" value={waterInput} onChange={(e) => setWaterInput(e.target.value)} placeholder="自訂 ml" className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-sky-400 focus:bg-white" />
                <button onClick={() => { addWater(Number(waterInput)); setWaterInput(""); }} disabled={!Number(waterInput)} className="rounded-xl bg-sky-600 px-3 text-sm font-bold text-white disabled:opacity-40">＋</button>
              </div>
            </div>
            {data?.water_logs?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.water_logs.map((w) => (
                  <span key={w.id} className="group inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">
                    {w.time && <span className="text-slate-400">{w.time}</span>} {w.amount}ml
                    <button onClick={() => remove(w.id)} className="text-slate-300 hover:text-red-500">✕</button>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* 飲食 */}
          <Card title="飲食" emoji="🍽️" right={<span className="text-sm font-bold text-rose-600">攝取 {data?.food_calories || 0} kcal</span>}>
            <div className="space-y-1.5">
              {(data?.food ?? []).map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{mealLabel(f.meal)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{f.name}</span>
                  {f.calories != null && <span className="shrink-0 text-sm text-slate-500">{f.calories} kcal</span>}
                  <button onClick={() => remove(f.id)} className="shrink-0 text-slate-300 hover:text-red-500">✕</button>
                </div>
              ))}
              {(!data?.food || data.food.length === 0) && <p className="text-sm text-slate-400">今天還沒記錄飲食。</p>}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr_6rem_auto]">
              <select value={food.meal} onChange={(e) => setFood({ ...food, meal: e.target.value })} className={field}>
                {MEALS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input value={food.name} onChange={(e) => setFood({ ...food, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addFood()} placeholder="吃了什麼" className={field} />
              <input type="number" inputMode="numeric" value={food.calories} onChange={(e) => setFood({ ...food, calories: e.target.value })} placeholder="kcal" className={field} />
              <button onClick={addFood} disabled={!food.name.trim()} className="rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">＋</button>
            </div>
          </Card>

          {/* 運動 */}
          <Card
            title="運動"
            emoji="🏃"
            right={<span className="text-sm font-bold text-emerald-600">消耗 {data?.exercise_calories || 0} kcal・{data?.exercise_minutes || 0} 分</span>}
          >
            <div className="space-y-1.5">
              {(data?.exercise ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{e.name}</span>
                  {e.duration != null && <span className="shrink-0 text-xs text-slate-400">{e.duration} 分</span>}
                  {e.calories != null && <span className="shrink-0 text-sm text-slate-500">{e.calories} kcal</span>}
                  <button onClick={() => remove(e.id)} className="shrink-0 text-slate-300 hover:text-red-500">✕</button>
                </div>
              ))}
              {(!data?.exercise || data.exercise.length === 0) && <p className="text-sm text-slate-400">今天還沒記錄運動。</p>}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
              <input value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addExercise()} placeholder="運動項目" className={field} />
              <input type="number" inputMode="numeric" value={ex.duration} onChange={(e) => setEx({ ...ex, duration: e.target.value })} placeholder="分鐘" className={field} />
              <input type="number" inputMode="numeric" value={ex.calories} onChange={(e) => setEx({ ...ex, calories: e.target.value })} placeholder="kcal" className={field} />
              <button onClick={addExercise} disabled={!ex.name.trim()} className="rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">＋</button>
            </div>
          </Card>

          {/* 當日淨熱量小結 */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-slate-50 px-5 py-3 text-sm text-slate-600">
              當日淨熱量：<span className="font-black text-slate-800">{netCal} kcal</span>
              <span className="ml-2 text-xs text-slate-400">（攝取 {data?.food_calories || 0} − 運動 {data?.exercise_calories || 0}）</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
