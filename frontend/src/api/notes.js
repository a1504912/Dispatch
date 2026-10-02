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

// 上傳照片/影片/檔案；onProgress(0~100)
export async function uploadFile(notebookId, file, caption = "", onProgress, encMeta = "") {
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
