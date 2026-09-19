/** 從事件取出圖片陣列（相容舊的單張 image 欄位）。 */
export function parseImages(ev) {
  if (!ev) return [];
  if (ev.images) {
    try {
      const arr = JSON.parse(ev.images);
      if (Array.isArray(arr)) return arr.filter(Boolean);
    } catch {
      // ignore
    }
  }
  return ev.image ? [ev.image] : [];
}
