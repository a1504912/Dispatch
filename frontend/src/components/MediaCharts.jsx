import { useState } from "react";
import { compactNum } from "../mediaConst";

// 圖表用色集中在這裡，所有圖表看起來是同一套
const INK = {
  series: "#2a78d6",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  muted: "#898781",
  track: "#f0efec",
};

// 把座標軸最大值進位成好讀的數字（1、2、2.5、5 × 10^n）
function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].find((s) => s * pow >= value) * pow;
}

/**
 * 單一數列直條圖，滑過顯示明細。
 * data: [{ label, fullLabel?, value, tooltip: [[名稱, 文字], ...] }]
 */
export function ColumnChart({ data, height = 180, format = compactNum, labelMax = false }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const peak = Math.max(0, ...data.map((d) => d.value));

  return (
    <div className="select-none">
      <div className="flex">
        <div className="relative mr-2 w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ height, color: INK.muted }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0" style={{ bottom: `${(t / max) * 100}%`, transform: "translateY(50%)" }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0"
              style={{ bottom: `${(t / max) * 100}%`, borderTop: `1px solid ${t === 0 ? INK.baseline : INK.grid}` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={i}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
              >
                {hover === i && <div className="absolute inset-0 rounded bg-slate-900/[0.04]" />}
                <div
                  className="relative w-full max-w-[24px] rounded-t"
                  style={{
                    height: `${(d.value / max) * 100}%`,
                    minHeight: d.value > 0 ? 2 : 0,
                    background: INK.series,
                    opacity: hover === null || hover === i ? 1 : 0.55,
                  }}
                >
                  {labelMax && d.value === peak && peak > 0 && (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-700">
                      {format(d.value)}
                    </span>
                  )}
                </div>
                {hover === i && d.tooltip && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
                    <p className="mb-1 font-bold text-slate-800">{d.fullLabel || d.label}</p>
                    {d.tooltip.map(([name, text]) => (
                      <p key={name} className="flex justify-between gap-4 text-slate-500">
                        <span>{name}</span>
                        <span className="tabular-nums text-slate-900">{text}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-12 mt-1 flex text-[11px]" style={{ color: INK.muted }}>
        {data.map((d, i) => (
          <span key={i} className="w-0 flex-1 whitespace-nowrap text-center">
            {/* 窄螢幕上欄位多時，每三欄標一次 */}
            <span className={data.length > 8 && i % 3 ? "hidden sm:inline" : ""}>{d.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 橫條列：每列一個項目，數值標在右上。
 * rows: [{ key, label, value, valueText, color?, sub?, target? }]
 * target 會在軌道上畫一條細刻度（例如目標比例）。
 */
export function BarRows({ rows, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-700">
              {r.color && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-900">{r.valueText}</span>
          </div>
          <div className="relative h-3 rounded-r" style={{ background: INK.track }}>
            <div
              className="h-full rounded-r"
              style={{ width: `${Math.min((r.value / top) * 100, 100)}%`, background: r.color || INK.series }}
            />
            {r.target > 0 && (
              <div
                className="absolute -top-1 h-5 w-0.5 bg-slate-800"
                style={{ left: `calc(${Math.min((r.target / top) * 100, 100)}% - 1px)` }}
              />
            )}
          </div>
          {r.sub && <p className="mt-1 text-xs text-slate-500">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
