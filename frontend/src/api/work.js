import client from "./client";

export const listCases = async () => (await client.get("/api/work/cases")).data;
export const createCase = async (body) => (await client.post("/api/work/cases", body)).data;
export const updateCase = async (id, body) => (await client.put(`/api/work/cases/${id}`, body)).data;
export const deleteCase = async (id) => client.delete(`/api/work/cases/${id}`);

export const listTables = async (caseId) => (await client.get(`/api/work/cases/${caseId}/tables`)).data;
export const createTable = async (caseId, body) => (await client.post(`/api/work/cases/${caseId}/tables`, body)).data;
export const updateTable = async (id, body) => (await client.put(`/api/work/tables/${id}`, body)).data;
export const deleteTable = async (id) => client.delete(`/api/work/tables/${id}`);

export const listRows = async (tableId) => (await client.get(`/api/work/tables/${tableId}/rows`)).data;
export const createRow = async (tableId, data) => (await client.post(`/api/work/tables/${tableId}/rows`, { data })).data;
export const updateRow = async (id, data) => (await client.put(`/api/work/rows/${id}`, { data })).data;
export const deleteRow = async (id) => client.delete(`/api/work/rows/${id}`);

export const searchCase = async (caseId, q) =>
  (await client.get(`/api/work/cases/${caseId}/search`, { params: { q } })).data;

export async function previewImport(file) {
  const fd = new FormData();
  fd.append("file", file, file.name || "import.xlsx");
  return (await client.post("/api/work/import/preview", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
}
export const commitImport = async (caseId, tables) =>
  (await client.post(`/api/work/cases/${caseId}/import`, { tables })).data;
