import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { assetUrl } from "../api/client";
import { listPillars } from "../api/pillars";
import { createPost, deletePost, listPosts } from "../api/posts";
import PostEditor from "../components/PostEditor.jsx";
import {
  PLATFORMS,
  STATUSES,
  formatDateTime,
  formatNumber,
  platformLabel,
  statusOf,
} from "../lib/content";

const selectClass = "rounded-md border px-2 py-1.5 text-sm";

export default function Content() {
  const [posts, setPosts] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState({ status: "", platform: "", pillar_id: "", q: "" });
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get("post")) || null;

  async function refresh() {
    try {
      const [p, pl] = await Promise.all([listPosts(), listPillars()]);
      setPosts(p);
      setPillars(pl);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Filter client-side: the list is small and this keeps typing in search instant.
  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return posts.filter(
      (p) =>
        (!filters.status || p.status === filters.status) &&
        (!filters.platform || p.platform === filters.platform) &&
        (!filters.pillar_id ||
          (filters.pillar_id === "none"
            ? p.pillar_id == null
            : String(p.pillar_id) === filters.pillar_id)) &&
        (!q || `${p.title} ${p.body} ${p.tags}`.toLowerCase().includes(q))
    );
  }, [posts, filters]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s.value, 0]));
    posts.forEach((p) => (c[p.status] += 1));
    return c;
  }, [posts]);

  const selected = posts.find((p) => p.id === selectedId);
  const pillarById = Object.fromEntries(pillars.map((p) => [p.id, p]));

  function select(id) {
    setSearchParams(id ? { post: String(id) } : {});
  }

  async function handleNew() {
    const post = await createPost({
      title: "未命名貼文",
      status: "idea",
      platform: filters.platform || "instagram",
      pillar_id: filters.pillar_id && filters.pillar_id !== "none" ? Number(filters.pillar_id) : null,
    });
    setPosts((p) => [post, ...p]);
    select(post.id);
  }

  function handleChange(updated) {
    setPosts((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleDelete(id) {
    await deletePost(id);
    setPosts((list) => list.filter((p) => p.id !== id));
    select(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      {/* ---------- List ---------- */}
      <aside className="flex flex-col rounded-lg border bg-white lg:h-[calc(100vh-7.5rem)]">
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">內容</h2>
            <button
              onClick={handleNew}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              ＋ 新貼文
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {[{ value: "", label: "全部" }, ...STATUSES].map((s) => (
              <button
                key={s.value}
                onClick={() => setFilters({ ...filters, status: s.value })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  filters.status === s.value
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {s.label}
                <span className="ml-1 text-gray-400">
                  {s.value ? counts[s.value] : posts.length}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className={selectClass}
              value={filters.platform}
              onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
            >
              <option value="">所有平台</option>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.pillar_id}
              onChange={(e) => setFilters({ ...filters, pillar_id: e.target.value })}
            >
              <option value="">所有主題</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="none">未分類</option>
            </select>
          </div>
          <input
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            placeholder="搜尋標題、內文、標籤…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>

        <ul className="flex-1 divide-y overflow-y-auto">
          {loadError && (
            <li className="p-4 text-sm text-red-600">讀取失敗，請確認 backend 是否啟動。</li>
          )}
          {!loadError && visible.length === 0 && (
            <li className="p-4 text-sm text-gray-400">
              {posts.length === 0 ? "還沒有貼文，按「新貼文」開始吧。" : "沒有符合條件的貼文。"}
            </li>
          )}
          {visible.map((p) => {
            const pillar = pillarById[p.pillar_id];
            const status = statusOf(p.status);
            const when = p.status === "published" ? p.published_at : p.scheduled_at;
            return (
              <li key={p.id}>
                <button
                  onClick={() => select(p.id)}
                  className={`flex w-full gap-3 px-3 py-2.5 text-left hover:bg-gray-50 ${
                    p.id === selectedId ? "bg-indigo-50" : ""
                  }`}
                >
                  {p.images[0] ? (
                    <img
                      src={assetUrl(p.images[0].url)}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{p.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      <span className={`rounded px-1.5 py-0.5 ${status.style}`}>{status.label}</span>
                      <span>{platformLabel(p.platform)}</span>
                      {pillar && (
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: pillar.color }}
                          />
                          {pillar.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {when && formatDateTime(when)}
                      {p.latest_metric && ` · 👁 ${formatNumber(p.latest_metric.views)}`}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ---------- Editor ---------- */}
      <div className="min-w-0">
        {selected ? (
          <PostEditor
            key={selected.id}
            post={selected}
            pillars={pillars}
            onChange={handleChange}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed bg-white text-sm text-gray-400">
            從左邊選一篇貼文，或按「新貼文」開始寫。
          </div>
        )}
      </div>
    </div>
  );
}
