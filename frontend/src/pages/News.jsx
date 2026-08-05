import { useEffect, useState } from "react";
import { getNews } from "../api/news";

const TOPICS = [
  ["top", "頭條"],
  ["nation", "台灣"],
  ["world", "國際"],
  ["business", "財經"],
  ["technology", "科技"],
  ["sports", "運動"],
  ["entertainment", "娛樂"],
];

function timeAgo(pub) {
  if (!pub) return "";
  const d = new Date(pub);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} 分鐘前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  return `${Math.round(hrs / 24)} 天前`;
}

export default function News() {
  const [topic, setTopic] = useState("top");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  function load(t) {
    setLoading(true);
    getNews(t)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(topic);
  }, [topic]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">今日新聞</h1>
          <p className="mt-1 text-sm text-slate-500">來源：Google 新聞，點標題看原文。</p>
        </div>
        <button
          onClick={() => load(topic)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
        >
          ↻ 更新
        </button>
      </div>

      {/* 分類 */}
      <div className="flex flex-wrap gap-1.5">
        {TOPICS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTopic(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              topic === key
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 清單 */}
      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">載入新聞中…</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">
          暫時抓不到新聞，稍後再試（需要伺服器連得到網路）。
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {items.map((it, i) => (
            <a
              key={i}
              href={it.link}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-slate-800">{it.title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {it.source}
                  {it.source && it.published && " · "}
                  {timeAgo(it.published)}
                </p>
              </div>
              {it.image && (
                <img
                  src={it.image}
                  alt=""
                  loading="lazy"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  className="h-16 w-24 shrink-0 rounded-lg border border-slate-100 object-cover"
                />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
