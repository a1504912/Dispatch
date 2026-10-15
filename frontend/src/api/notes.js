import client, { getToken } from "./client";

export async function listNotebooks(includeHidden = false) {
  const { data } = await client.get("/api/notes/notebooks", { params: includeHidden ? { include_hidden: 1 } : {} });
  return data;
}

export async function createNotebook(payload) {
  const { data } = await client.post("/api/notes/notebooks", payload);
  return data;
}

export async function updateNotebook(id, payload) {
  const { data } = await client.put(`/api/notes/notebooks/${id}`, payload);
  return data;
}

export async function deleteNotebook(id) {
  await client.delete(`/api/notes/notebooks/${id}`);
}

export async function listItems(notebookId, before = null, limit = 60) {
  const { data } = await client.get(`/api/notes/notebooks/${notebookId}/items`, {
    params: before ? { before, limit } : { limit },
  });
  return data;
}

export async function addText(notebookId, text) {
  const { data } = await client.post(`/api/notes/notebooks/${notebookId}/items`, { text });
  return data;
}

// 大檔分段上傳：Cloudflare 網址每個請求最多 100MB，所以超過 CHUNK 的檔案切成一段段送
const CHUNK = 20 * 1024 * 1024;

function newUploadId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b); // http 網址也能用（不像 randomUUID 需要 https）
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function sendChunks(notebookId, blob, onProgress) {
  const uploadId = newUploadId();
  const total = blob.size;
  for (let offset = 0; offset < total; offset += CHUNK) {
    const piece = blob.slice(offset, Math.min(offset + CHUNK, total));
    for (let attempt = 1; ; attempt++) {
      try {
        const fd = new FormData();
        fd.append("upload_id", uploadId);
        fd.append("offset", String(offset));
        fd.append("total", String(total));
        fd.append("file", piece, "chunk.bin");
        await client.post(`/api/notes/notebooks/${notebookId}/upload-chunk`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress((offset + (e.loaded / e.total) * piece.size) / total);
          },
        });
        break;
      } catch (e) {
        const st = e?.response?.status;
        // 網路斷一下就重送這一段（最多 4 次）；檔案太大、空間不夠這種就直接放棄
        if (attempt >= 4 || (st && st < 500 && st !== 408 && st !== 429)) throw e;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  return { uploadId, total };
}

// 上傳照片/影片/檔案；onProgress(0~100)
export async function uploadFile(notebookId, file, caption = "", onProgress, encMeta = "") {
  if (file.size > CHUNK) {
    const { uploadId, total } = await sendChunks(notebookId, file, (r) => onProgress?.(Math.min(99, Math.round(r * 100))));
    const fd = new FormData();
    fd.append("upload_id", uploadId);
    fd.append("total", String(total));
    fd.append("filename", file.name || "file");
    fd.append("content_type", file.type || "application/octet-stream");
    fd.append("caption", caption);
    if (encMeta) fd.append("enc_meta", encMeta);
    const { data } = await client.post(`/api/notes/notebooks/${notebookId}/upload-finish`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    onProgress?.(100);
    return data;
  }
  const fd = new FormData();
  fd.append("file", file, file.name || "file");
  fd.append("caption", caption);
  if (encMeta) fd.append("enc_meta", encMeta);
  const { data } = await client.post(`/api/notes/notebooks/${notebookId}/upload`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}

export async function editItem(itemId, text) {
  const { data } = await client.put(`/api/notes/items/${itemId}`, { text });
  return data;
}

export async function deleteItem(itemId) {
  await client.delete(`/api/notes/items/${itemId}`);
}

// <img>/<video> 帶不了 Authorization header → 網址加 ?token=
export function mediaUrl(path, download = false) {
  if (!path) return "";
  const base = client.defaults.baseURL || "";
  const qs = new URLSearchParams();
  const token = getToken();
  if (token) qs.set("token", token);
  if (download) qs.set("download", "1");
  const q = qs.toString();
  return `${base}${path}${q ? `?${q}` : ""}`;
}

// 取回原始位元組（加密記事本要先下載再在瀏覽器解密）
export async function fetchMediaBytes(path) {
  const { data } = await client.get(path, { responseType: "arraybuffer" });
  return data;
}

// ---------- 既有記事本改成加密 ----------
export async function stageEncryptedBlob(notebookId, blob, onProgress) {
  if (blob.size > CHUNK) {
    const { uploadId, total } = await sendChunks(notebookId, blob, onProgress);
    const fd = new FormData();
    fd.append("upload_id", uploadId);
    fd.append("total", String(total));
    const { data } = await client.post(`/api/notes/notebooks/${notebookId}/encrypt/blob-finish`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.blob;
  }
  const fd = new FormData();
  fd.append("file", blob, "data.bin");
  const { data } = await client.post(`/api/notes/notebooks/${notebookId}/encrypt/blob`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    },
  });
  return data.blob;
}

export async function commitEncryption(notebookId, payload) {
  const { data } = await client.post(`/api/notes/notebooks/${notebookId}/encrypt/commit`, payload);
  return data;
}

// 連到某本記事本的行程
export async function listNotebookEvents(notebookId) {
  const { data } = await client.get(`/api/notes/notebooks/${notebookId}/events`);
  return data;
}
