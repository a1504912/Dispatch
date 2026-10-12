import { useState } from "react";
import { compactNumber } from "../lib/content";

// Chart ink, kept in one place so every chart reads as one system.
export const CHART = {
  series: "#2a78d6",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  muted: "#898781",
};

// Round an axis max up to a clean number (1, 2, 2.5, 5 x 10^n).
function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value);
  return step * pow;
}

/**
 * Single-series column chart with a per-column hover tooltip.
 * data: [{ label, value, tooltip: [[name, text], ...] }]
 */
export function ColumnChart({ data, height = 180, format = compactNumber, highlightMax = false }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const peak = Math.max(...data.map((d) => d.value));

  return (
    <div className="relative select-none">
      <div className="flex">
        {/* y-axis ticks */}
        <div className="relative mr-2 w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ height, color: CHART.muted }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0"
              style={{ bottom: `${(t / max) * 100}%`, transform: "translateY(50%)" }}
            >
              {format(t)}
            </span>
          ))}
        </div>
        {/* plot */}
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0"
              style={{
                bottom: `${(t / max) * 100}%`,
                borderTop: `1px solid ${t === 0 ? CHART.baseline : CHART.grid}`,
              }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => {
              const isPeak = highlightMax && d.value === peak && peak > 0;
              return (
                <div
                  key={d.label}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {hover === i && <div className="absolute inset-0 bg-gray-900/[0.04]" />}
                  <div
                    className="relative w-full max-w-[24px] rounded-t"
                    style={{
                      height: `${(d.value / max) * 100}%`,
                      minHeight: d.value > 0 ? 2 : 0,
                      background: CHART.series,
                      opacity: hover === null || hover === i ? 1 : 0.55,
                    }}
                  >
                    {isPeak && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-gray-700">
                        {format(d.value)}
                      </span>
                    )}
                  </div>
                  {hover === i && d.tooltip && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-md border bg-white px-3 py-2 text-xs shadow-lg">
                      <p className="mb-1 font-medium text-gray-800">{d.fullLabel || d.label}</p>
                      {d.tooltip.map(([name, text]) => (
                        <p key={name} className="flex justify-between gap-4 text-gray-600">
                          <span>{name}</span>
                          <span className="tabular-nums text-gray-900">{text}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* x labels */}
      <div className="ml-12 mt-1 flex text-[11px]" style={{ color: CHART.muted }}>
        {data.map((d, i) => (
          <span key={d.label} className="w-0 flex-1 whitespace-nowrap text-center">
            {/* On narrow screens dense axes only label every third column. */}
            <span className={data.length > 8 && i % 3 ? "hidden sm:inline" : ""}>{d.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal bar rows: one bar per entity, value labelled at the bar tip.
 * rows: [{ key, label, value, color?, valueText, sub?, target?, title? }]
 * target (0-max) draws a thin tick on the track - e.g. a planned share.
 */
export function BarRows({ rows, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={r.title}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-gray-700">
              {r.color && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="tabular-nums text-gray-900">{r.valueText}</span>
          </div>
          <div className="relative h-3 rounded-r" style={{ background: "#f0efec" }}>
            <div
              className="h-full rounded-r"
              style={{
                width: `${Math.min((r.value / top) * 100, 100)}%`,
                background: r.color || CHART.series,
              }}
            />
            {r.target != null && r.target > 0 && (
              <div
                className="absolute -top-1 h-5 w-0.5 bg-gray-800"
                style={{ left: `calc(${Math.min((r.target / top) * 100, 100)}% - 1px)` }}
              />
            )}
          </div>
          {r.sub && <p className="mt-1 text-xs text-gray-500">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

export function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
