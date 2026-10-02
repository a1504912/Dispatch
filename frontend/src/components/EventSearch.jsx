import { useEffect, useMemo, useRef, useState } from "react";

function whenLabel(ev) {
  if (ev.is_task) return "待辦";
  const s = new Date(ev.start_time);
  const date = s.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  if (ev.all_day) return `${date}　整天`;
  return `${date}　${s.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export default function EventSearch({ events = [], subtasks = [], categories = [], onOpen }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const subsByEvent = useMemo(() => {
    const m = {};
    for (const st of subtasks) (m[st.event_id] ??= []).push(st);
    return m;
  }, [subtasks]);

  const results = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return [];
    const out = [];
    for (const ev of events) {
      const inTitle = (ev.title || "").toLowerCase().includes(kw);
      const inDesc = (ev.description || "").toLowerCase().includes(kw);
      const matchedSubs = (subsByEvent[ev.id] ?? []).filter((s) =>
        (s.title || "").toLowerCase().includes(kw)
      );
      if (inTitle || inDesc || matchedSubs.length > 0) {
        out.push({ ev, matchedSubs });
      }
    }
    // 待辦排最後，其餘依日期
    out.sort((a, b) => {
      if (a.ev.is_task !== b.ev.is_task) return a.ev.is_task ? 1 : -1;
      if (a.ev.is_task) return 0;
      return new Date(a.ev.start_time) - new Date(b.ev.start_time);
    });
    return out.slice(0, 40);
  }, [q, events, subsByEvent]);

  const catOf = (id) => categories.find((c) => c.id === id);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34m0 0A8 8 0 1 0 5.34 5.34a8 8 0 0 0 11.32 11.32Z" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="搜尋行程、待辦、明細關鍵字…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {q && (
          <button onClick={() => setQ("")} className="shrink-0 text-slate-300 hover:text-slate-500">
            ✕
          </button>
        )}
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">找不到「{q}」相關項目</p>
          ) : (
            <>
              <p className="px-2 py-1 text-xs text-slate-400">找到 {results.length} 筆</p>
              {results.map(({ ev, matchedSubs }) => {
                const cat = catOf(ev.category_id);
                return (
                  <button
                    key={ev.id}
                    onClick={() => {
                      onOpen(ev);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
                    style={{ borderLeft: `3px solid ${ev.color}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {ev.title}
                        {ev.is_task && (
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            待辦
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {whenLabel(ev)}
                        {cat && `　·　${cat.name}`}
                      </p>
                      {matchedSubs.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-indigo-500">
                          明細：{matchedSubs.map((s) => s.title).join("、")}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
