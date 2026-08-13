import { useEffect, useRef, useState } from "react";

const MIN = 1;
const MAX = 8;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

export default function Lightbox() {
  const [src, setSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrapRef = useRef(null);
  const drag = useRef(null); // 滑鼠/單指拖曳
  const pinch = useRef(null); // 雙指縮放

  function reset() {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  // 開啟
  useEffect(() => {
    const onOpen = (e) => {
      setSrc(e.detail);
      setScale(1);
      setPos({ x: 0, y: 0 });
    };
    window.addEventListener("dispatch:lightbox", onOpen);
    return () => window.removeEventListener("dispatch:lightbox", onOpen);
  }, []);

  // Esc 關閉
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => e.key === "Escape" && setSrc(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src]);

  // 滾輪縮放（用非被動監聽才能 preventDefault）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setScale((s) => {
        const next = clamp(s * (e.deltaY < 0 ? 1.15 : 0.87));
        if (next === 1) setPos({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src]);

  if (!src) return null;

  // ---- 滑鼠拖曳 ----
  function onMouseDown(e) {
    if (scale <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, bx: pos.x, by: pos.y };
  }
  function onMouseMove(e) {
    if (!drag.current) return;
    setPos({ x: drag.current.bx + (e.clientX - drag.current.x), y: drag.current.by + (e.clientY - drag.current.y) });
  }
  function onMouseUp() {
    drag.current = null;
  }

  // ---- 觸控：單指拖曳、雙指縮放 ----
  function dist(t) {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      pinch.current = { d: dist(e.touches), base: scale };
    } else if (e.touches.length === 1 && scale > 1) {
      drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, bx: pos.x, by: pos.y };
    }
  }
  function onTouchMove(e) {
    if (pinch.current && e.touches.length === 2) {
      e.preventDefault();
      const next = clamp(pinch.current.base * (dist(e.touches) / pinch.current.d));
      setScale(next);
      if (next === 1) setPos({ x: 0, y: 0 });
    } else if (drag.current && e.touches.length === 1) {
      setPos({
        x: drag.current.bx + (e.touches[0].clientX - drag.current.x),
        y: drag.current.by + (e.touches[0].clientY - drag.current.y),
      });
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length === 0) {
      drag.current = null;
      pinch.current = null;
    }
  }

  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-white transition hover:bg-white/30";

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[60] flex touch-none select-none items-center justify-center overflow-hidden bg-black/85"
      onClick={() => setSrc(null)}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <img
        src={src}
        alt="預覽"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          scale > 1 ? reset() : setScale(2.5);
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          cursor: scale > 1 ? "grab" : "zoom-in",
          transition: drag.current || pinch.current ? "none" : "transform 0.12s",
        }}
        className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />

      {/* 控制列 */}
      <div
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={btn} onClick={() => setScale((s) => clamp(s * 0.8))} title="縮小">
          −
        </button>
        <span className="w-12 text-center text-sm font-medium text-white">
          {Math.round(scale * 100)}%
        </span>
        <button className={btn} onClick={() => setScale((s) => clamp(s * 1.25))} title="放大">
          ＋
        </button>
        <button className={`${btn} text-base`} onClick={reset} title="重設">
          ⤢
        </button>
      </div>

      <button
        onClick={() => setSrc(null)}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg text-white transition hover:bg-white/30"
        title="關閉（Esc）"
      >
        ✕
      </button>
    </div>
  );
}
