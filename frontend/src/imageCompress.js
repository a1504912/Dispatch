// 把圖片檔壓縮成較小的 JPEG data URL（貼圖前用，省空間、載入更快）。
export function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff"; // 透明底轉白，避免 JPEG 變黑
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const out = canvas.toDataURL("image/jpeg", quality);
          // 壓完反而更大就用原圖（極少數已很小的圖）
          resolve(out.length < reader.result.length ? out : reader.result);
        } catch {
          resolve(reader.result);
        }
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}
