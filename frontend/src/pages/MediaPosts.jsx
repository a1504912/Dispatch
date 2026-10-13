import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addMetric,
  assist,
  createPost,
  deleteMetric,
  deletePost,
  getPost,
  listMetrics,
  listPillars,
  listPosts,
  updatePost,
} from "../api/media";
import { compressImageFile } from "../imageCompress";
import { openImage } from "../lightbox";
import {
  PLATFORMS,
  STATUSES,
  errMsg,
  field,
  fmtDateTime,
  fmtNum,
  platformLabel,
  statusOf,
  toInputDateTime,
} from "../mediaConst";

const MAX_IMAGES = 20;

const ASSIST_MODES = [
  { mode: "draft", label: "寫初稿" },
  { mode: "titles", label: "想標題" },
  { mode: "hashtags", label: "Hashtag" },
  { mode: "polish", label: "潤飾內文" },
  { mode: "ideas", label: "發想點子" },
];

const METRIC_FIELDS = [
  { key: "views", label: "觸及/觀看" },
  { key: "likes", label: "按讚" },
  { key: "comments", label: "留言" },
  { key: "shares", label: "分享" },
  { key: "saves", label: "收藏" },
  { key: "followers_gained", label: "新增粉絲" },
];
const emptyMetric = Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, ""]));

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const label = "mb-1 block text-xs font-semibold text-slate-500";

function formOf(post) {
  return {
    title: post.title,
    body: post.body,
    platform: post.platform,
    status: post.status,
    pillar_id: post.pillar_id ?? "",
    tags: post.tags,
    scheduled_at: toInputDateTime(post.scheduled_at),
    published_at: toInputDateTime(post.published_at),
    url: post.url,
    images: post.images || [],
  };
}

function rateOf(m) {
  if (!m?.views) return "—";
  return `${(((m.likes + m.comments + m.shares + m.saves) / m.views) * 100).toFixed(1)}%`;
}

/* ---------- 編輯器 ---------- */
function PostEditor({ postId, pillars, onSaved, onDeleted, onBack, onDirty }) {
  const [post, setPost] = useState(null);
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState("claude");
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [metricForm, setMetricForm] = useState(emptyMetric);
  const fileInput = useRef(null);

  // 讓列表知道有沒有未儲存的修改（切換貼文前提醒）
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  useEffect(() => {
    getPost(postId)
      .then((p) => {
        setPost(p);
        setForm(formOf(p));
      })
      .catch((e) => setNotice({ error: true, text: errMsg(e) }));
    listMetrics(postId).then(setMetrics).catch(() => setMetrics([]));
  }, [postId]);

  if (!form) {
    return <p className="py-16 text-center text-sm text-slate-400">{notice?.text || "載入中…"}</p>;
  }

  const pillar = pillars.find((p) => String(p.id) === String(form.pillar_id));
  const platform = PLATFORMS.find((p) => p.value === form.platform);
  const chars = [...form.body].length;
  const over = platform?.limit && chars > platform.limit;
  const isPublished = form.status === "published";

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    if (!form.title.trim()) return setNotice({ error: true, text: "標題不能空白" });
    setSaving(true);
    try {
      const updated = await updatePost(postId, {
        ...form,
        pillar_id: form.pillar_id === "" ? null : Number(form.pillar_id),
        scheduled_at: form.scheduled_at || null,
        published_at: form.published_at || null,
      });
      setPost(updated);
      setForm(formOf(updated));
      setDirty(false);
      setNotice({ text: "已儲存" });
      onSaved(updated);
    } catch (e) {
      setNotice({ error: true, text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  async function addImages(e) {
    const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - form.images.length;
    if (room <= 0) return setNotice({ error: true, text: `一篇最多 ${MAX_IMAGES} 張圖` });
    setAdding(true);
    const urls = (await Promise.all(files.slice(0, room).map((f) => compressImageFile(f)))).filter(Boolean);
    setAdding(false);
    set({ images: [...form.images, ...urls] });
  }

  function moveImage(i, dir) {
    const arr = [...form.images];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set({ images: arr });
  }

  async function runAssist(mode) {
    setAiBusy(mode);
    setAi(null);
    try {
      const r = await assist({
        provider,
        mode,
        platform: form.platform,
        pillar_id: form.pillar_id === "" ? null : Number(form.pillar_id),
        title: form.title,
        body: form.body,
      });
      setAi(r);
    } catch (e) {
      setAi({ mode, error: errMsg(e) });
    } finally {
      setAiBusy(null);
    }
  }

  function applyAi(how) {
    const text = ai.result;
    if (how === "replace") set({ body: text });
    else if (how === "append") set({ body: form.body ? `${form.body}\n\n${text}` : text });
    else if (how === "tags") set({ tags: (text.match(/#[^\s#]+/g) || []).map((t) => t.slice(1)).join(", ") });
  }

  async function recordMetric(e) {
    e.preventDefault();
    const body = Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, Number(metricForm[f.key]) || 0]));
    try {
      const m = await addMetric(postId, body);
      setMetrics((list) => [...list, m]);
      setMetricForm(emptyMetric);
      onSaved({ ...post, latest_metric: m });
    } catch (e) {
      setNotice({ error: true, text: errMsg(e) });
    }
  }

  async function removeMetric(id) {
    await deleteMetric(postId, id);
    const rest = metrics.filter((m) => m.id !== id);
    setMetrics(rest);
    onSaved({ ...post, latest_metric: rest[rest.length - 1] || null });
  }

  async function remove() {
    if (!confirm(`刪除「${post.title}」？圖片與數據會一起刪除。`)) return;
    await deletePost(postId);
    onDeleted(postId);
  }

  return (
    <div className="space-y-4">
      {/* 標題列 */}
      <div className={`${card} space-y-3`}>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-xl px-2 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 md:hidden">
            ←
          </button>
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-lg font-black text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            placeholder="貼文標題"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "儲存中…" : dirty ? "儲存" : "已儲存"}
          </button>
        </div>
        {notice && (
          <p className={`rounded-lg px-3 py-2 text-sm ${notice.error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
            {notice.text}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>平台</label>
            <select className={field} value={form.platform} onChange={(e) => set({ platform: e.target.value })}>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>主題方向</label>
            <select className={field} value={form.pillar_id} onChange={(e) => set({ pillar_id: e.target.value })}>
              <option value="">未分類</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>狀態</label>
            <select className={field} value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>{isPublished ? "發佈時間" : "預計發佈"}</label>
            <input
              type="datetime-local"
              className={field}
              value={isPublished ? form.published_at : form.scheduled_at}
              onChange={(e) => set(isPublished ? { published_at: e.target.value } : { scheduled_at: e.target.value })}
            />
          </div>
        </div>

        {pillar && (pillar.description || pillar.audience || pillar.tone) && (
          <div className="rounded-xl border-l-4 bg-slate-50 px-3 py-2 text-sm text-slate-600" style={{ borderColor: pillar.color }}>
            <p className="font-bold text-slate-800">方向提醒｜{pillar.name}</p>
            {pillar.description && <p>{pillar.description}</p>}
            {(pillar.audience || pillar.tone) && (
              <p className="text-xs text-slate-500">
                {pillar.audience && <>受眾：{pillar.audience}　</>}
                {pillar.tone && <>語氣：{pillar.tone}</>}
              </p>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className={label}>內文</label>
            <span className={`text-xs ${over ? "font-bold text-rose-600" : "text-slate-400"}`}>
              {fmtNum(chars)}
              {platform?.limit ? ` / ${fmtNum(platform.limit)} 字` : " 字"}
              {over && "（超過平台上限）"}
            </span>
          </div>
          <textarea
            className={`${field} leading-relaxed`}
            rows={12}
            placeholder="開始寫貼文…"
            value={form.body}
            onChange={(e) => set({ body: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={label}>標籤（逗號分隔）</label>
            <input className={field} placeholder="效率, 工具, 職場" value={form.tags} onChange={(e) => set({ tags: e.target.value })} />
          </div>
          <div>
            <label className={label}>貼文連結</label>
            <input className={field} placeholder="https://…（發佈後填寫）" value={form.url} onChange={(e) => set({ url: e.target.value })} />
          </div>
        </div>
      </div>

      {/* 圖片 */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">
            圖片 <span className="text-sm font-medium text-slate-400">{form.images.length} 張</span>
          </h3>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={adding}
            className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
          >
            {adding ? "處理中…" : "＋ 加圖片"}
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={addImages} />
        </div>
        {form.images.length === 0 ? (
          <p className="text-sm text-slate-400">還沒有圖片。可一次選多張，會自動壓縮；記得按「儲存」。</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {form.images.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                <img src={src} alt="" onClick={() => openImage(src)} className="h-full w-full cursor-zoom-in object-cover" />
                <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 text-xs font-bold text-white">{i + 1}</span>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <span className="flex gap-1">
                    {i > 0 && (
                      <button onClick={() => moveImage(i, -1)} title="往前" className="rounded-md bg-black/60 px-1.5 text-xs text-white hover:bg-black/80">←</button>
                    )}
                    {i < form.images.length - 1 && (
                      <button onClick={() => moveImage(i, 1)} title="往後" className="rounded-md bg-black/60 px-1.5 text-xs text-white hover:bg-black/80">→</button>
                    )}
                  </span>
                  <button
                    onClick={() => set({ images: form.images.filter((_, j) => j !== i) })}
                    title="移除"
                    className="rounded-md bg-black/60 px-1.5 text-xs text-white hover:bg-rose-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI 小編 */}
      <div className={card}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-black text-slate-900">✨ AI 小編</h3>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[
              ["gpt", "🤖 GPT", "text-slate-800"],
              ["claude", "✳️ Claude", "text-orange-600"],
            ].map(([key, text, active]) => (
              <button
                key={key}
                onClick={() => setProvider(key)}
                className={`rounded-lg px-3 py-1 text-sm font-bold transition ${provider === key ? `bg-white shadow-sm ${active}` : "text-slate-500 hover:text-slate-700"}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-400">會參考目前的平台、主題方向（受眾、語氣）、標題與內文。用的是主機上已登入的 Codex / Claude。</p>
        <div className="flex flex-wrap gap-2">
          {ASSIST_MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => runAssist(m.mode)}
              disabled={aiBusy !== null}
              className="rounded-xl bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
            >
              {aiBusy === m.mode ? "生成中…" : m.label}
            </button>
          ))}
        </div>
        {aiBusy && <p className="mt-2 text-xs text-slate-400">AI 思考中，大約 10–60 秒…</p>}
        {ai && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            {ai.error ? (
              <p className="text-sm text-rose-600">{ai.error}</p>
            ) : (
              <>
                <pre className="whitespace-pre-wrap font-[inherit] text-sm text-slate-800">{ai.result}</pre>
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                  {(ai.mode === "draft" || ai.mode === "polish") && (
                    <button onClick={() => applyAi("replace")} className="text-indigo-600 hover:underline">取代內文</button>
                  )}
                  {ai.mode === "hashtags" && (
                    <button onClick={() => applyAi("tags")} className="text-indigo-600 hover:underline">填入標籤</button>
                  )}
                  <button onClick={() => applyAi("append")} className="text-indigo-600 hover:underline">附加到內文</button>
                  <button onClick={() => navigator.clipboard?.writeText(ai.result)} className="text-slate-500 hover:underline">複製</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 成效數據 */}
      <div className={card}>
        <h3 className="text-base font-black text-slate-900">📊 成效數據</h3>
        <p className="mb-3 text-xs text-slate-400">從平台後台抄下目前的累計數字。可以多記幾次（例如發文後 1 天、7 天），分析以最新一筆為準。</p>
        <form onSubmit={recordMetric} className="grid grid-cols-3 gap-2 md:grid-cols-7">
          {METRIC_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={label}>{f.label}</label>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className={field}
                value={metricForm[f.key]}
                onChange={(e) => setMetricForm({ ...metricForm, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700">
              記錄
            </button>
          </div>
        </form>
        {metrics.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] whitespace-nowrap text-sm tabular-nums">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="py-2 pr-3 font-medium">記錄時間</th>
                  {METRIC_FIELDS.map((f) => (
                    <th key={f.key} className="py-2 pr-3 text-right font-medium">{f.label}</th>
                  ))}
                  <th className="py-2 pr-3 text-right font-medium">互動率</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...metrics].reverse().map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3 text-slate-500">{fmtDateTime(m.recorded_at)}</td>
                    {METRIC_FIELDS.map((f) => (
                      <td key={f.key} className="py-2 pr-3 text-right text-slate-800">{fmtNum(m[f.key])}</td>
                    ))}
                    <td className="py-2 pr-3 text-right font-semibold text-slate-800">{rateOf(m)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeMetric(m.id)} className="text-xs text-slate-400 hover:text-rose-600">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={remove} className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50">刪除這篇貼文</button>
      </div>
    </div>
  );
}

/* ---------- 主頁：列表 + 編輯器 ---------- */
export default function MediaPosts() {
  const [posts, setPosts] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", platform: "", pillar: "", q: "" });
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("post")) || null;
  const dirtyRef = useRef(false);
  const onDirty = useCallback((d) => {
    dirtyRef.current = d;
  }, []);

  useEffect(() => {
    Promise.all([listPosts(), listPillars()])
      .then(([p, pl]) => {
        setPosts(p);
        setPillars(pl);
      })
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  const pillarById = Object.fromEntries(pillars.map((p) => [p.id, p]));
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s.value, 0]));
    posts.forEach((p) => (c[p.status] = (c[p.status] || 0) + 1));
    return c;
  }, [posts]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return posts.filter(
      (p) =>
        (!filters.status || p.status === filters.status) &&
        (!filters.platform || p.platform === filters.platform) &&
        (!filters.pillar || (filters.pillar === "none" ? !pillarById[p.pillar_id] : String(p.pillar_id) === filters.pillar)) &&
        (!q || `${p.title} ${p.body} ${p.tags}`.toLowerCase().includes(q))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, filters, pillars]);

  function select(id, force = false) {
    if (!force && id !== selectedId && dirtyRef.current && !confirm("這篇還沒儲存，確定要離開嗎？")) return;
    dirtyRef.current = false;
    setParams(id ? { post: String(id) } : {});
  }

  async function newPost() {
    try {
      const post = await createPost({
        platform: filters.platform || "instagram",
        pillar_id: filters.pillar && filters.pillar !== "none" ? Number(filters.pillar) : null,
      });
      setPosts((list) => [post, ...list]);
      select(post.id);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const onSaved = (updated) => setPosts((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated, images: undefined } : p)));
  const onDeleted = (id) => {
    setPosts((list) => list.filter((p) => p.id !== id));
    select(null, true);
  };

  const chip = (active) =>
    `whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"}`;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className={`flex flex-wrap items-center justify-between gap-3 ${selectedId ? "hidden md:flex" : ""}`}>
        <div>
          <h1 className="text-2xl font-black text-slate-900">📣 自媒體・內容</h1>
          <p className="text-xs text-slate-400">從點子、草稿、排程到發佈，一篇一篇管理</p>
        </div>
        <button onClick={newPost} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700">
          ＋ 新貼文
        </button>
      </div>
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[20rem_1fr] lg:grid-cols-[22rem_1fr]">
        {/* 列表（手機上選了貼文就隱藏） */}
        <aside className={`${selectedId ? "hidden md:flex" : "flex"} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:max-h-[calc(100vh-9rem)]`}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="flex flex-wrap gap-1">
              {[{ value: "", label: "全部" }, ...STATUSES].map((s) => (
                <button key={s.value} onClick={() => setFilters({ ...filters, status: s.value })} className={chip(filters.status === s.value)}>
                  {s.label} <span className="text-slate-400">{s.value ? counts[s.value] : posts.length}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className={field} value={filters.platform} onChange={(e) => setFilters({ ...filters, platform: e.target.value })}>
                <option value="">所有平台</option>
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <select className={field} value={filters.pillar} onChange={(e) => setFilters({ ...filters, pillar: e.target.value })}>
                <option value="">所有主題</option>
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="none">未分類</option>
              </select>
            </div>
            <input className={field} placeholder="搜尋標題、內文、標籤…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {loading && <li className="p-6 text-center text-sm text-slate-400">載入中…</li>}
            {!loading && visible.length === 0 && (
              <li className="p-6 text-center text-sm text-slate-400">
                {posts.length === 0 ? "還沒有貼文，按「＋ 新貼文」開始寫" : "沒有符合條件的貼文"}
              </li>
            )}
            {visible.map((p) => {
              const pl = pillarById[p.pillar_id];
              const st = statusOf(p.status);
              const when = p.status === "published" ? p.published_at : p.scheduled_at;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => select(p.id)}
                    className={`flex w-full gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 ${p.id === selectedId ? "bg-indigo-50" : ""}`}
                  >
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">📝</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{p.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className={`rounded-md px-1.5 py-0.5 font-semibold ${st.style}`}>{st.label}</span>
                        <span>{platformLabel(p.platform)}</span>
                        {pl && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: pl.color }} />
                            {pl.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {when && fmtDateTime(when)}
                        {p.latest_metric && ` · 👁 ${fmtNum(p.latest_metric.views)}`}
                        {p.image_count > 1 && ` · 🖼 ${p.image_count}`}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* 編輯器 */}
        <div className={`min-w-0 ${selectedId ? "" : "hidden md:block"}`}>
          {selectedId ? (
            <PostEditor
              key={selectedId}
              postId={selectedId}
              pillars={pillars}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onBack={() => select(null)}
              onDirty={onDirty}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
              從左邊選一篇貼文，或按「＋ 新貼文」開始寫
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
