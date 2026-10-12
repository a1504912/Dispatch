import { useEffect, useRef, useState } from "react";
import { assetUrl, errorMessage } from "../api/client";
import { assist } from "../api/content";
import {
  addMetric,
  deleteImage,
  deleteMetric,
  listMetrics,
  updatePost,
  uploadImages,
} from "../api/posts";
import {
  PLATFORMS,
  STATUSES,
  formatDateTime,
  formatNumber,
  toInputDateTime,
} from "../lib/content";

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

const inputClass = "w-full rounded-md border px-3 py-2 text-sm";
const labelClass = "mb-1 block text-xs font-medium text-gray-500";

function formFromPost(post) {
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
  };
}

function engagementRate(m) {
  if (!m?.views) return "—";
  const engagement = m.likes + m.comments + m.shares + m.saves;
  return `${((engagement / m.views) * 100).toFixed(1)}%`;
}

export default function PostEditor({ post, pillars, onChange, onDelete }) {
  const [form, setForm] = useState(() => formFromPost(post));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [metricForm, setMetricForm] = useState(emptyMetric);
  const fileInput = useRef(null);

  // The parent keys this component by post id, so local state starts fresh per post.
  useEffect(() => {
    listMetrics(post.id)
      .then(setMetrics)
      .catch(() => setMetrics([]));
  }, [post.id]);

  const pillar = pillars.find((p) => String(p.id) === String(form.pillar_id));
  const platform = PLATFORMS.find((p) => p.value === form.platform);
  const charCount = [...form.body].length;
  const overLimit = platform?.limit && charCount > platform.limit;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setNotice({ type: "error", text: "標題不能空白" });
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePost(post.id, {
        ...form,
        pillar_id: form.pillar_id === "" ? null : Number(form.pillar_id),
        scheduled_at: form.scheduled_at || null,
        published_at: form.published_at || null,
      });
      onChange(updated);
      setForm(formFromPost(updated));
      setDirty(false);
      setNotice({ type: "ok", text: "已儲存" });
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const images = await uploadImages(post.id, files);
      onChange({ ...post, images: [...post.images, ...images] });
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err, "圖片上傳失敗") });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(imageId) {
    await deleteImage(post.id, imageId);
    onChange({ ...post, images: post.images.filter((i) => i.id !== imageId) });
  }

  async function handleAssist(mode) {
    setAiLoading(mode);
    setAiResult(null);
    try {
      const res = await assist({
        mode,
        platform: form.platform,
        pillar_id: form.pillar_id === "" ? null : Number(form.pillar_id),
        title: form.title,
        body: form.body,
      });
      setAiResult(res);
    } catch (err) {
      setAiResult({
        mode,
        error: errorMessage(err, "AI 沒有回應，請確認 backend 與 Ollama 是否啟動。"),
      });
    } finally {
      setAiLoading(null);
    }
  }

  function applyAi(how) {
    const text = aiResult.result;
    if (how === "replace") set("body", text);
    else if (how === "append") set("body", form.body ? `${form.body}\n\n${text}` : text);
    else if (how === "tags") {
      const tags = text.match(/#[^\s#]+/g) || [];
      set("tags", tags.map((t) => t.slice(1)).join(", "));
    }
  }

  async function handleAddMetric(e) {
    e.preventDefault();
    const payload = Object.fromEntries(
      METRIC_FIELDS.map((f) => [f.key, Number(metricForm[f.key]) || 0])
    );
    try {
      const metric = await addMetric(post.id, payload);
      setMetrics((m) => [...m, metric]);
      setMetricForm(emptyMetric);
      onChange({ ...post, latest_metric: metric });
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err) });
    }
  }

  async function handleDeleteMetric(metricId) {
    await deleteMetric(post.id, metricId);
    const remaining = metrics.filter((m) => m.id !== metricId);
    setMetrics(remaining);
    onChange({ ...post, latest_metric: remaining[remaining.length - 1] || null });
  }

  return (
    <div className="space-y-4">
      {/* ---------- Editor ---------- */}
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2 text-lg font-semibold"
            placeholder="貼文標題"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "儲存中…" : dirty ? "儲存" : "已儲存"}
          </button>
          <button
            onClick={() => {
              if (window.confirm(`確定刪除「${post.title}」？圖片與數據會一併刪除。`)) {
                onDelete(post.id);
              }
            }}
            className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            刪除
          </button>
        </div>
        {notice && (
          <p
            className={`text-sm ${notice.type === "error" ? "text-red-600" : "text-green-700"}`}
          >
            {notice.text}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className={labelClass}>平台</label>
            <select
              className={inputClass}
              value={form.platform}
              onChange={(e) => set("platform", e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>主題方向</label>
            <select
              className={inputClass}
              value={form.pillar_id}
              onChange={(e) => set("pillar_id", e.target.value)}
            >
              <option value="">未分類</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              {form.status === "published" ? "發佈時間" : "預計發佈"}
            </label>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.status === "published" ? form.published_at : form.scheduled_at}
              onChange={(e) =>
                set(
                  form.status === "published" ? "published_at" : "scheduled_at",
                  e.target.value
                )
              }
            />
          </div>
        </div>

        {pillar && (pillar.description || pillar.audience || pillar.tone) && (
          <div
            className="rounded-md border-l-4 bg-gray-50 px-3 py-2 text-sm text-gray-600"
            style={{ borderColor: pillar.color }}
          >
            <span className="font-medium text-gray-800">方向提醒｜{pillar.name}</span>
            {pillar.description && <p>{pillar.description}</p>}
            <p className="text-xs text-gray-500">
              {pillar.audience && <>受眾：{pillar.audience}　</>}
              {pillar.tone && <>語氣：{pillar.tone}</>}
            </p>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={labelClass}>內文</label>
            <span className={`text-xs ${overLimit ? "font-medium text-red-600" : "text-gray-400"}`}>
              {formatNumber(charCount)}
              {platform?.limit ? ` / ${formatNumber(platform.limit)} 字` : " 字"}
              {overLimit && "（超過平台上限）"}
            </span>
          </div>
          <textarea
            className={`${inputClass} font-[inherit] leading-relaxed`}
            rows={12}
            placeholder="開始寫貼文…"
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>標籤（逗號分隔）</label>
            <input
              className={inputClass}
              placeholder="效率, 工具, 職場"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>貼文連結</label>
            <input
              className={inputClass}
              placeholder="https://…（發佈後填寫）"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ---------- Images ---------- */}
      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            圖片 <span className="font-normal text-gray-400">({post.images.length})</span>
          </h3>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? "上傳中…" : "上傳圖片"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            hidden
            onChange={handleUpload}
          />
        </div>
        {post.images.length === 0 ? (
          <p className="text-sm text-gray-400">還沒有圖片。支援 JPG / PNG / GIF / WebP，可一次選多張。</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {post.images.map((img, i) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-md border bg-gray-50">
                <img
                  src={assetUrl(img.url)}
                  alt={img.original_name}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">
                  {i + 1}
                </span>
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  title="刪除圖片"
                  className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 text-xs text-white hover:bg-red-600 group-hover:block"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- AI assist ---------- */}
      <section className="rounded-lg border bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">AI 小編</h3>
        <p className="mb-3 text-xs text-gray-400">
          會參考目前的平台、主題方向（受眾、語氣）、標題與內文。
        </p>
        <div className="flex flex-wrap gap-2">
          {ASSIST_MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => handleAssist(m.mode)}
              disabled={aiLoading !== null}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
            >
              {aiLoading === m.mode ? "生成中…" : m.label}
            </button>
          ))}
        </div>
        {aiResult && (
          <div className="mt-3 rounded-md bg-gray-50 p-3">
            {aiResult.error ? (
              <p className="text-sm text-red-600">{aiResult.error}</p>
            ) : (
              <>
                <pre className="whitespace-pre-wrap font-[inherit] text-sm text-gray-800">
                  {aiResult.result}
                </pre>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {(aiResult.mode === "draft" || aiResult.mode === "polish") && (
                    <button onClick={() => applyAi("replace")} className="text-indigo-600 hover:underline">
                      取代內文
                    </button>
                  )}
                  {aiResult.mode === "hashtags" && (
                    <button onClick={() => applyAi("tags")} className="text-indigo-600 hover:underline">
                      填入標籤
                    </button>
                  )}
                  <button onClick={() => applyAi("append")} className="text-indigo-600 hover:underline">
                    附加到內文
                  </button>
                  <button
                    onClick={() => navigator.clipboard?.writeText(aiResult.result)}
                    className="text-gray-500 hover:underline"
                  >
                    複製
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ---------- Metrics ---------- */}
      <section className="rounded-lg border bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">成效數據</h3>
        <p className="mb-3 text-xs text-gray-400">
          從平台後台抄下目前的累計數字。可以多記幾次（例如發文後 1 天、7 天），分析以最新一筆為準。
        </p>
        <form onSubmit={handleAddMetric} className="grid grid-cols-3 gap-2 md:grid-cols-7">
          {METRIC_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                value={metricForm[f.key]}
                onChange={(e) => setMetricForm({ ...metricForm, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              記錄
            </button>
          </div>
        </form>

        {metrics.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-1.5 pr-3 font-medium">記錄時間</th>
                  {METRIC_FIELDS.map((f) => (
                    <th key={f.key} className="py-1.5 pr-3 text-right font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-1.5 pr-3 text-right font-medium">互動率</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...metrics].reverse().map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 text-gray-500">{formatDateTime(m.recorded_at)}</td>
                    {METRIC_FIELDS.map((f) => (
                      <td key={f.key} className="py-1.5 pr-3 text-right">
                        {formatNumber(m[f.key])}
                      </td>
                    ))}
                    <td className="py-1.5 pr-3 text-right">{engagementRate(m)}</td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => handleDeleteMetric(m.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
