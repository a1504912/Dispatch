import { useEffect, useState } from "react";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgentStatus,
} from "../api/agents";

const STATUSES = ["active", "idle", "disabled"];

const statusStyles = {
  active: "bg-green-100 text-green-700",
  idle: "bg-yellow-100 text-yellow-700",
  disabled: "bg-gray-200 text-gray-500",
};

const emptyForm = { name: "", role: "", model: "", system_prompt: "" };

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(emptyForm);

  async function refresh() {
    try {
      setAgents(await listAgents());
    } catch {
      setAgents([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await createAgent(form);
    setForm(emptyForm);
    refresh();
  }

  async function handleDelete(id) {
    await deleteAgent(id);
    refresh();
  }

  async function handleStatus(id, status) {
    await updateAgentStatus(id, status);
    refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">新增員工</h2>
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="名稱"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="角色 (role)"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Ollama 模型"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            新增
          </button>
          <textarea
            className="rounded-md border px-3 py-2 text-sm sm:col-span-2 lg:col-span-4"
            placeholder="System prompt"
            rows={2}
            value={form.system_prompt}
            onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
          />
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">員工列表</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-400">尚無員工，先新增一個吧。</p>
        ) : (
          <ul className="divide-y">
            {agents.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-gray-500">
                    {a.role || "—"} · {a.model || "預設模型"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusStyles[a.status] || ""
                    }`}
                  >
                    {a.status}
                  </span>
                  <select
                    value={a.status}
                    onChange={(e) => handleStatus(a.id, e.target.value)}
                    className="rounded-md border px-2 py-1 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
