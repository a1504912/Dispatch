import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnalytics } from "../api/media";
import { BarRows, ColumnChart } from "../components/MediaCharts.jsx";
import { compactNum, errMsg, fmtDateTime, fmtNum, pct, platformLabel } from "../mediaConst";

const RANGES = [
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 90 天" },
  { days: null, label: "全部" },
];

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-black text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Card({ title, sub, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      <p className="mb-3 text-xs text-slate-400">{sub}</p>
      {children}
    </section>
  );
}

const Empty = ({ children }) => <p className="py-8 text-center text-sm text-slate-400">{children}</p>;

export default function MediaAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getAnalytics(days)
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(errMsg(e)));
  }, [days]);

  const t = data?.totals;
  const bestDay = data && [...data.by_weekday].filter((d) => d.posts > 0).sort((a, b) => b.engagement_rate - a.engagement_rate)[0];
  const mixRows = data ? data.by_pillar.filter((r) => r.posts > 0 || r.target_ratio > 0) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">📊 自媒體・數據分析</h1>
          <p className="text-xs text-slate-400">互動＝讚＋留言＋分享＋收藏；互動率＝互動 ÷ 觸及</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              className={`whitespace-nowrap rounded-lg px-3 py-1 text-sm font-bold transition ${days === r.days ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</p>}

      {!data ? (
        !err && <p className="py-16 text-center text-sm text-slate-400">載入中…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="已發佈" value={fmtNum(t.published)} sub={`排程 ${t.scheduled}・草稿 ${t.drafts}・點子 ${t.ideas}`} />
            <Stat label="總觸及 / 觀看" value={compactNum(t.views)} sub={fmtNum(t.views)} />
            <Stat label="總互動" value={compactNum(t.engagement)} sub={`讚 ${compactNum(t.likes)}・留言 ${compactNum(t.comments)}`} />
            <Stat label="互動率" value={pct(t.engagement_rate)} sub={`分享 ${compactNum(t.shares)}・收藏 ${compactNum(t.saves)}`} />
            <Stat label="新增粉絲" value={fmtNum(t.followers_gained)} />
          </div>

          {t.views === 0 && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              💡 這段期間還沒有成效數據。到
              <Link to="/media/posts" className="font-bold underline">內容</Link>
              打開已發佈的貼文，在「成效數據」記下觸及、按讚等數字，這裡就會開始有圖表。
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="每週觸及" sub="最近 12 週，依發佈週加總每篇最新的觸及數（點或滑過看明細）">
              <ColumnChart
                labelMax
                data={data.weekly.map((w) => ({
                  label: w.week_start.slice(5).replace("-", "/"),
                  fullLabel: `${w.week_start} 起的一週`,
                  value: w.views,
                  tooltip: [
                    ["發文", `${w.posts} 篇`],
                    ["觸及", fmtNum(w.views)],
                    ["互動", fmtNum(w.engagement)],
                    ["互動率", w.views ? pct((w.engagement / w.views) * 100) : "—"],
                  ],
                }))}
              />
            </Card>

            <Card title="主題方向：實際 vs 目標" sub="長條是實際發文佔比（不含點子），黑色刻度是目標比例">
              {mixRows.length === 0 ? (
                <Empty>
                  先到<Link to="/media/pillars" className="font-bold text-indigo-600 hover:underline">主題方向</Link>設定幾個主題吧
                </Empty>
              ) : (
                <BarRows
                  max={100}
                  rows={mixRows.map((r) => ({
                    key: r.pillar_id ?? "none",
                    label: r.name,
                    color: r.color,
                    value: r.actual_ratio,
                    target: r.target_ratio,
                    valueText: `${r.actual_ratio}%${r.target_ratio ? ` / 目標 ${r.target_ratio}%` : ""}`,
                    sub: `${r.posts} 篇・觸及 ${compactNum(r.views)}・互動率 ${pct(r.engagement_rate)}`,
                  }))}
                />
              )}
            </Card>

            <Card title="各平台觸及" sub="哪個平台帶來最多觸及">
              {data.by_platform.length === 0 ? (
                <Empty>這段期間沒有貼文</Empty>
              ) : (
                <BarRows
                  rows={data.by_platform.map((r) => ({
                    key: r.platform,
                    label: platformLabel(r.platform),
                    value: r.views,
                    valueText: fmtNum(r.views),
                    sub: `${r.posts} 篇・互動率 ${pct(r.engagement_rate)}`,
                  }))}
                />
              )}
            </Card>

            <Card
              title="星期幾發文效果最好"
              sub={
                bestDay
                  ? `目前互動率最高的是${bestDay.weekday}（${pct(bestDay.engagement_rate)}）。長條是平均每篇觸及。`
                  : "記錄更多已發佈貼文的數據後，這裡會告訴你最佳發文日。"
              }
            >
              <ColumnChart
                height={140}
                data={data.by_weekday.map((d) => ({
                  label: d.weekday,
                  value: d.avg_views,
                  tooltip: [
                    ["發文", `${d.posts} 篇`],
                    ["平均觸及", fmtNum(d.avg_views)],
                    ["互動率", d.posts ? pct(d.engagement_rate) : "—"],
                  ],
                }))}
              />
            </Card>
          </div>

          <Card title="🔥 熱門貼文" sub="依觸及排序，前 10 名">
            {data.top_posts.length === 0 ? (
              <Empty>還沒有貼文記錄過成效數據</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] whitespace-nowrap text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                      <th className="py-2 pr-3 font-medium">貼文</th>
                      <th className="py-2 pr-3 font-medium">平台</th>
                      <th className="py-2 pr-3 font-medium">主題</th>
                      <th className="py-2 pr-3 font-medium">發佈</th>
                      <th className="py-2 pr-3 text-right font-medium">觸及</th>
                      <th className="py-2 pr-3 text-right font-medium">互動</th>
                      <th className="py-2 pr-3 text-right font-medium">互動率</th>
                      <th className="py-2 text-right font-medium">新粉絲</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.top_posts.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="max-w-[16rem] truncate py-2 pr-3">
                          <Link to={`/media/posts?post=${p.id}`} className="font-semibold text-slate-800 hover:text-indigo-600 hover:underline">
                            {p.title}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{platformLabel(p.platform)}</td>
                        <td className="py-2 pr-3 text-slate-600">{p.pillar}</td>
                        <td className="py-2 pr-3 text-slate-500">{fmtDateTime(p.published_at).slice(0, 10)}</td>
                        <td className="py-2 pr-3 text-right text-slate-800">{fmtNum(p.views)}</td>
                        <td className="py-2 pr-3 text-right text-slate-800">{fmtNum(p.engagement)}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-slate-800">{pct(p.engagement_rate)}</td>
                        <td className="py-2 text-right text-slate-800">{fmtNum(p.followers_gained)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
