import { useEffect, useState } from "react";
import { listAgents } from "../api/agents";
import { sendChat } from "../api/chat";

export default function ChatBox() {
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listAgents()
      .then((data) => {
        setAgents(data);
        if (data.length > 0) setAgentId(String(data[0].id));
      })
      .catch(() => setAgents([]));
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim() || !agentId) return;

    const userMessage = message.trim();
    setHistory((h) => [...h, { role: "user", text: userMessage }]);
    setMessage("");
    setLoading(true);

    try {
      const res = await sendChat(Number(agentId), userMessage);
      setHistory((h) => [...h, { role: "assistant", text: res.reply }]);
    } catch (err) {
      setHistory((h) => [
        ...h,
        { role: "error", text: "傳送失敗，請確認 backend 與 Ollama 是否啟動。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">AI 對話</h2>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
        >
          {agents.length === 0 && <option value="">尚無 agent</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.role ? `(${a.role})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {history.length === 0 && (
          <p className="text-sm text-gray-400">選一個員工，開始對話吧。</p>
        )}
        {history.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-indigo-600 text-white"
                : m.role === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-800"
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400">思考中…</p>}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t p-3">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="輸入訊息…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          送出
        </button>
      </form>
    </div>
  );
}
