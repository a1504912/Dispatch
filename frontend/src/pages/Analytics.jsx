import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSummary } from "../api/analytics";
import { BarRows, ColumnChart, StatTile } from "../components/Charts.jsx";
import { compactNumber, formatDateTime, formatNumber, platformLabel } from "../lib/content";

const RANGES = [
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 90 天" },
  { days: null, label: "全部" },
];

const pct = (n) => `${n.toFixed(1)}%`;

function Card({ title, sub, children, className = "" }) {
  return (
    <section className={`rounded-lg border bg-white p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {sub && <p className="mb-3 text-xs text-gray-500">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>;
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSummary(days)
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [days]);

  if (error) {
    return <p className="text-sm text-red-600">讀取失敗，請確認 backend 是否啟動。</p>;
  }
  if (!data) return <p className="text-sm text-gray-400">載入中…</p>;

  const t = data.totals;
  const hasMetrics = t.views > 0;
  const bestDay = [...data.by_weekday]
    .filter((d) => d.posts > 0)
    .sort((a, b) => b.engagement_rate - a.engagement_rate)[0];
  const mixRows = data.by_pillar.filter((r) => r.posts > 0 || r.target_ratio > 0);

  return (
    <div className="space-y-4">
      {/* ---------- Filter row ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">數據分析</h1>
        <div className="flex rounded-md border bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              className={`rounded px-3 py-1 text-sm ${
                days === r.days ? "bg-indigo-100 font-medium text-indigo-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- KPI tiles ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="已發佈" value={formatNumber(t.published)} sub={`另有 ${t.scheduled} 篇排程、${t.drafts} 篇草稿`} />
        <StatTile label="總觸及 / 觀看" value={compactNumber(t.views)} sub={formatNumber(t.views)} />
        <StatTile label="總互動" value={compactNumber(t.engagement)} sub={`讚 ${compactNumber(t.likes)}・留言 ${compactNumber(t.comments)}`} />
        <StatTile label="互動率" value={pct(t.engagement_rate)} sub="互動 ÷ 觸及" />
        <StatTile label="新增粉絲" value={formatNumber(t.followers_gained)} sub={`分享 ${compactNumber(t.shares)}・收藏 ${compactNumber(t.saves)}`} />
      </div>

      {!hasMetrics && (
        <p className="rounded-md border border-dashed bg-white px-4 py-3 text-sm text-gray-500">
          這段期間還沒有成效數據。到<Link to="/content" className="text-indigo-600 hover:underline">內容</Link>
          打開已發佈的貼文，在「成效數據」記下觸及、按讚等數字，這裡就會開始有圖表。
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---------- Weekly trend ---------- */}
        <Card title="每週觸及" sub="近 12 週，依發佈週加總每篇最新的觸及數">
          <ColumnChart
            highlightMax
            data={data.weekly.map((w) => ({
              label: w.week_start.slice(5).replace("-", "/"),
              fullLabel: `${w.week_start} 起的一週`,
              value: w.views,
              tooltip: [
                ["發文", `${w.posts} 篇`],
                ["觸及", formatNumber(w.views)],
                ["互動", formatNumber(w.engagement)],
                ["互動率", w.views ? pct((w.engagement / w.views) * 100) : "—"],
              ],
            }))}
          />
        </Card>

        {/* ---------- Pillar mix ---------- */}
        <Card title="主題方向：實際 vs 目標" sub="長條是實際發文佔比（不含點子），黑色刻度是目標比例">
          {mixRows.length === 0 ? (
            <Empty>
              先到<Link to="/pillars" className="text-indigo-600 hover:underline">主題方向</Link>設定幾個主題吧。
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
                sub: `${r.posts} 篇・觸及 ${compactNumber(r.views)}・互動率 ${pct(r.engagement_rate)}`,
              }))}
            />
          )}
        </Card>

        {/* ---------- Platforms ---------- */}
        <Card title="各平台觸及" sub="哪個平台帶來最多觸及">
          {data.by_platform.length === 0 ? (
            <Empty>這段期間沒有貼文。</Empty>
          ) : (
            <BarRows
              rows={data.by_platform.map((r) => ({
                key: r.platform,
                label: platformLabel(r.platform),
                value: r.views,
                valueText: formatNumber(r.views),
                sub: `${r.posts} 篇・互動率 ${pct(r.engagement_rate)}`,
              }))}
            />
          )}
        </Card>

        {/* ---------- Weekday ---------- */}
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
                ["平均觸及", formatNumber(d.avg_views)],
                ["互動率", d.posts ? pct(d.engagement_rate) : "—"],
              ],
            }))}
          />
        </Card>
      </div>

      {/* ---------- Top posts ---------- */}
      <Card title="熱門貼文" sub="依觸及排序，前 10 名">
        {data.top_posts.length === 0 ? (
          <Empty>還沒有貼文記錄過成效數據。</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
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
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="max-w-[16rem] truncate py-2 pr-3">
                      <Link to={`/content?post=${p.id}`} className="text-gray-800 hover:text-indigo-600 hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{platformLabel(p.platform)}</td>
                    <td className="py-2 pr-3 text-gray-600">{p.pillar}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-500">{formatDateTime(p.published_at).slice(0, 10)}</td>
                    <td className="py-2 pr-3 text-right">{formatNumber(p.views)}</td>
                    <td className="py-2 pr-3 text-right">{formatNumber(p.engagement)}</td>
                    <td className="py-2 pr-3 text-right">{pct(p.engagement_rate)}</td>
                    <td className="py-2 text-right">{formatNumber(p.followers_gained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
