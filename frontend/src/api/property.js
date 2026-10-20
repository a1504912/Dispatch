import client, { getToken } from "./client";

export const listProperty = async () => (await client.get("/api/property/items")).data;
export const createProperty = async (body) => (await client.post("/api/property/items", body)).data;
export const updateProperty = async (id, body) => (await client.put(`/api/property/items/${id}`, body)).data;
export const deleteProperty = async (id) => client.delete(`/api/property/items/${id}`);
export const markDateDone = async (id, dateId, undo = false) =>
  (await client.post(`/api/property/items/${id}/dates/${dateId}/done`, { undo })).data;

export async function uploadPropertyFile(id, file, onProgress) {
  const fd = new FormData();
  fd.append("file", file, file.name || "file");
  const { data } = await client.post(`/api/property/items/${id}/files`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}
export const deletePropertyFile = async (fileId) => (await client.delete(`/api/property/files/${fileId}`)).data;

export const getPropertySettings = async () => (await client.get("/api/property/settings")).data;
export const savePropertySettings = async (body) => (await client.put("/api/property/settings", body)).data;

// <img> / 開新分頁帶不了 Authorization header → 網址加 ?token=
export function fileUrl(path, download = false) {
  if (!path) return "";
  const qs = new URLSearchParams();
  const token = getToken();
  if (token) qs.set("token", token);
  if (download) qs.set("download", "1");
  const q = qs.toString();
  return `${client.defaults.baseURL || ""}${path}${q ? `?${q}` : ""}`;
}
