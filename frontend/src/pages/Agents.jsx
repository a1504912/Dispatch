import { useEffect, useState } from "react";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgentStatus,
} from "../api/agents";
import { listModels } from "../api/models";
import {
  DEFAULT_MODEL,
  OLLAMA_MODELS,
  STATUSES,
  STATUS_DOT,
  STATUS_LABELS,
  STATUS_PILL,
  agentEmoji,
  agentGradient,
} from "../constants";

const emptyForm = { name: "", role: "", model: DEFAULT_MODEL, system_prompt: "" };

function AgentCard({ agent, onDelete, onStatus }) {
  return (
    <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl shadow-md ${agentGradient(agent)}`}
        >
          {agentEmoji(agent)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-800">{agent.name}</p>
          <p className="truncate text-sm text-slate-500">{agent.role || "通用助理"}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_PILL[agent.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
          {STATUS_LABELS[agent.status]}
        </span>
      </div>

      {agent.system_prompt && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {agent.system_prompt}
        </p>
      )}

      <div className="mt-3">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500">
          🦙 {agent.model || "預設模型"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3.5">
        <select
          value={agent.status}
          onChange={(e) => onStatus(agent.id, e.target.value)}
          className="flex-1 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(agent)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          刪除
        </button>
      </div>
    </div>
  );
}

function CreateModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // 預設用內建清單，成功讀到 Ollama 後改用實際安裝的模型
  const [modelOptions, setModelOptions] = useState(OLLAMA_MODELS);
  const [ollamaOnline, setOllamaOnline] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    listModels()
      .then((data) => {
        setOllamaOnline(data.ollama_online);
        if (data.models?.length) {
          setModelOptions(data.models.map((name) => ({ value: name, label: name })));
          setForm((f) => ({
            ...f,
            model: data.models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : data.models[0],
          }));
        }
      })
      .catch(() => setOllamaOnline(null));
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-black text-slate-900">招募新員工 🎉</h2>
        <p className="mt-1 text-sm text-slate-400">幫新成員取個名字、指定職責與使用的模型。</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">名稱 *</label>
              <input
                autoFocus
                className={field}
                placeholder="例：簡報大師"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">職責</label>
              <input
                className={field}
                placeholder="例：簡報、文件"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">
              使用模型
              {ollamaOnline === true && (
                <span className="ml-2 font-normal text-emerald-600">● 已連線 Ollama，顯示已安裝的模型</span>
              )}
              {ollamaOnline === false && (
                <span className="ml-2 font-normal text-amber-600">● Ollama 未連線，顯示建議清單</span>
              )}
            </label>
            <select
              className={`${field} cursor-pointer`}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            >
              {modelOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">
              人設（System Prompt）
            </label>
            <textarea
              className={field}
              rows={3}
              placeholder="例：你是簡報專家，回答一律使用繁體中文，擅長把複雜內容濃縮成清楚的大綱…"
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!form.name.trim() || saving}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "建立中…" : "加入團隊"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

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

  async function handleCreate(form) {
    await createAgent(form);
    refresh();
  }

  async function handleDelete(agent) {
    if (!window.confirm(`確定要讓「${agent.name}」離職嗎？`)) return;
    await deleteAgent(agent.id);
    refresh();
  }

  async function handleStatus(id, status) {
    await updateAgentStatus(id, status);
    refresh();
  }

  return (
    <div className="space-y-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">AI 員工</h1>
          <p className="mt-1 text-sm text-slate-500">
            你的團隊目前有 {agents.length} 位成員，
            {agents.filter((a) => a.status === "active").length} 位正在工作中。
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95"
        >
          ＋ 招募新員工
        </button>
      </div>

      {/* 員工卡片牆 */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 py-20 text-center">
          <span className="text-5xl">🏢</span>
          <p className="font-bold text-slate-600">辦公室空空的</p>
          <p className="text-sm text-slate-400">點右上角「招募新員工」，建立你的第一位 AI 助理</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onDelete={handleDelete} onStatus={handleStatus} />
          ))}
        </div>
      )}

      <CreateModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleCreate} />
    </div>
  );
}
