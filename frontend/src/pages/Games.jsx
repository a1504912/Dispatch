import { useEffect, useMemo, useState } from "react";
import { getGames } from "../api/games";

// 已知平台（依 platforms 字串比對）
const PLATFORMS = [
  { key: "steam", label: "Steam", match: /steam/i, color: "bg-slate-700" },
  { key: "epic", label: "Epic", match: /epic/i, color: "bg-slate-900" },
  { key: "gog", label: "GOG", match: /gog/i, color: "bg-purple-700" },
  { key: "itchio", label: "itch.io", match: /itch/i, color: "bg-rose-600" },
  { key: "ubisoft", label: "Ubisoft", match: /ubisoft|uplay/i, color: "bg-sky-700" },
  { key: "ea", label: "EA", match: /origin|\bea\b/i, color: "bg-blue-700" },
  { key: "xbox", label: "Xbox", match: /xbox/i, color: "bg-green-700" },
  { key: "playstation", label: "PlayStation", match: /playstation|ps4|ps5/i, color: "bg-indigo-700" },
  { key: "android", label: "Android", match: /android/i, color: "bg-emerald-600" },
  { key: "ios", label: "iOS", match: /ios|iphone/i, color: "bg-slate-500" },
  { key: "drmfree", label: "DRM-Free", match: /drm-free/i, color: "bg-amber-600" },
];

function tagsOf(platforms) {
  const hits = PLATFORMS.filter((p) => p.match.test(platforms || ""));
  return hits.length ? hits : [{ key: "other", label: "其他", color: "bg-slate-400" }];
}

function endLabel(end) {
  if (!end || end === "N/A") return { text: "無期限", urgent: false };
  const d = new Date(end.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return { text: end, urgent: false };
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: "已結束", urgent: false };
  if (days === 0) return { text: "今天到期！", urgent: true };
  return { text: `剩 ${days} 天`, urgent: days <= 2 };
}

export default function Games() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  function load() {
    setLoading(true);
    getGames()
      .then((d) =>
        setGames(
          (d.games ?? []).map((g) => ({
            ...g,
            tags: tagsOf(g.platforms),
            isKey: /\bkey\b|序號|序号|cd key/i.test(g.title || ""),
          }))
        )
      )
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // 依實際出現的平台，動態產生篩選分頁
  const availableTabs = useMemo(() => {
    const present = new Set();
    games.forEach((g) => g.tags.forEach((t) => present.add(t.key)));
    return PLATFORMS.filter((p) => present.has(p.key)).concat(
      present.has("other") ? [{ key: "other", label: "其他" }] : []
    );
  }, [games]);

  const filtered =
    filter === "all" ? games : games.filter((g) => g.tags.some((t) => t.key === filter));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">免費遊戲</h1>
          <p className="mt-1 text-sm text-slate-500">
            各平台限免好康，每 30 分鐘自動更新。點平台可篩選。
          </p>
          <p className="mt-1 text-xs text-slate-400">
            🏷️ 標「序號」的是領 Key（到領取頁拿序號 → 自己在 Steam 啟用）；其餘為商店直接限免。
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
        >
          ↻ 更新
        </button>
      </div>

      {/* 平台篩選 */}
      {availableTabs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              filter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            全部（{games.length}）
          </button>
          {availableTabs.map((t) => {
            const count = games.filter((g) => g.tags.some((x) => x.key === t.key)).length;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  filter === t.key ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {t.label}（{count}）
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">載入中…</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">這個平台目前沒有限免。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => {
            const end = endLabel(g.end_date);
            return (
              <a
                key={g.id}
                href={g.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {g.image && (
                  <div className="relative">
                    <img
                      src={g.image}
                      alt=""
                      loading="lazy"
                      className="h-40 w-full bg-slate-100 object-cover"
                    />
                    <span
                      className={`absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-xs font-bold shadow ${
                        end.urgent ? "bg-red-500 text-white" : "bg-white/90 text-slate-700"
                      }`}
                    >
                      {end.text}
                    </span>
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      {g.tags.map((t) => (
                        <span
                          key={t.key}
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow ${t.color}`}
                        >
                          {t.label}
                        </span>
                      ))}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow ${
                          g.isKey ? "bg-amber-500" : "bg-emerald-600"
                        }`}
                      >
                        {g.isKey ? "序號" : "商店限免"}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <p className="font-bold leading-snug text-slate-800">{g.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {g.worth && g.worth !== "N/A" && (
                      <span className="line-through">{g.worth}</span>
                    )}
                    <span className="font-bold text-emerald-600">免費</span>
                  </div>
                  <span className="mt-3 inline-flex w-fit rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition group-hover:bg-indigo-700">
                    {g.isKey ? "領取序號 →" : "前往商店 →"}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
