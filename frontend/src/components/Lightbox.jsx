import { useEffect, useState } from "react";

export default function Lightbox() {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    const onOpen = (e) => setSrc(e.detail);
    window.addEventListener("dispatch:lightbox", onOpen);
    return () => window.removeEventListener("dispatch:lightbox", onOpen);
  }, []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e) => e.key === "Escape" && setSrc(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={() => setSrc(null)}
    >
      <img
        src={src}
        alt="預覽"
        className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={() => setSrc(null)}
        className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-lg text-white transition hover:bg-white/30"
        title="關閉（Esc）"
      >
        ✕
      </button>
    </div>
  );
}
