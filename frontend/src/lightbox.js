// 全域圖片放大：任何地方呼叫 openImage(src) 就會全螢幕預覽。
export function openImage(src) {
  if (src) window.dispatchEvent(new CustomEvent("dispatch:lightbox", { detail: src }));
}
