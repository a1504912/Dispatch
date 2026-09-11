import { useEffect, useRef, useState } from "react";
import { sendChat } from "../api/chat";
import { agentEmoji, agentGradient } from "../constants";

export default function ChatBox({ agents = [] }) {
  const [agentId, setAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // 員工清單載入後，預設選第一個可用的
  useEffect(() => {
    if (!agentId && agents.length > 0) {
      const first = agents.find((a) => a.status !== "disabled") ?? agents[0];
      setAgentId(String(first.id));
    }
  }, [agents, agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  const selected = agents.find((a) => String(a.id) === agentId);

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim() || !agentId || loading) return;

    const userMessage = message.trim();
    setHistory((h) => [...h, { role: "user", text: userMessage }]);
    setMessage("");
    setLoading(true);

    try {
      const res = await sendChat(Number(agentId), userMessage);
      setHistory((h) => [...h, { role: "assistant", text: res.reply, agent: selected }]);
    } catch {
      setHistory((h) => [
        ...h,
        { role: "error", text: "傳送失敗 — 請確認 backend 與 Ollama 是否正在執行。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 標頭：選擇員工 */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {selected ? (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg ${agentGradient(selected)}`}
          >
            {agentEmoji(selected)}
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
            💬
          </div>
        )}
        <div className="min-w-0 flex-1">
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setHistory([]);
            }}
            className="w-full cursor-pointer truncate rounded-lg border-0 bg-transparent p-0 text-sm font-bold text-slate-800 focus:ring-0"
          >
            {agents.length === 0 && <option value="">尚無員工</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="truncate text-xs text-slate-400">
            {selected ? `${selected.role || "助理"} · ${selected.model}` : "先到「AI 員工」頁建立團隊"}
          </p>
        </div>
      </div>

      {/* 訊息區 */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4">
        {history.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-4xl">{selected ? agentEmoji(selected) : "💬"}</span>
            <p className="text-sm font-medium text-slate-500">
              {selected ? `我是${selected.name}，${selected.role || "有事"}找我就對了！` : "選一位員工開始對話"}
            </p>
            <p className="text-xs text-slate-400">輸入訊息，交辦你的第一個任務</p>
          </div>
        )}

        {history.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm ${agentGradient(m.agent)}`}
              >
                {agentEmoji(m.agent)}
              </div>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200"
                  : m.role === "error"
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm ${agentGradient(selected)}`}
            >
              {agentEmoji(selected)}
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 輸入區 */}
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={selected ? `交辦給${selected.name}…` : "先選一位員工"}
          disabled={!selected}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !selected || !message.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          title="送出"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
