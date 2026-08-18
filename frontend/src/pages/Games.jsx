import { useEffect, useState } from "react";
import { getGames } from "../api/games";

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

  function load() {
    setLoading(true);
    getGames()
      .then((d) => setGames(d.games ?? []))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">免費遊戲</h1>
          <p className="mt-1 text-sm text-slate-500">
            Epic / Steam / GOG 等平台的限免好康，每 30 分鐘自動更新。
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
        >
          ↻ 更新
        </button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">載入中…</p>
      ) : games.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">
          暫時抓不到，稍後再試（需要伺服器連得到網路）。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((g) => {
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
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <p className="font-bold leading-snug text-slate-800">{g.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {g.platforms && <span>{g.platforms}</span>}
                    {g.worth && g.worth !== "N/A" && (
                      <span className="text-slate-400 line-through">{g.worth}</span>
                    )}
                    <span className="font-bold text-emerald-600">免費</span>
                  </div>
                  <span className="mt-3 inline-flex w-fit rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition group-hover:bg-indigo-700">
                    前往領取 →
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
