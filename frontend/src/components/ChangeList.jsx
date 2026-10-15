// 更新內容清單：每個更新一個標題，底下條列細節
export default function ChangeList({ commits, className = "" }) {
  if (!commits?.length) return null;
  return (
    <ol className={`space-y-3 ${className}`}>
      {commits.map((c) => (
        <li key={c.hash} className="rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-slate-100">
          <p className="text-sm font-bold leading-snug text-slate-800">{c.subject}</p>
          {c.date && <p className="mt-0.5 text-[11px] text-slate-400">{c.date}</p>}
          {c.points?.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {c.points.map((p, i) => (
                <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
                  <span className="mt-[1px] shrink-0 text-emerald-500">•</span>
                  <span className="min-w-0 break-words">{p}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
