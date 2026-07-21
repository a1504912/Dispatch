import { useEffect, useState } from "react";
import { listEvents, setEventCompleted } from "../api/events";
import { listCategories } from "../api/categories";
import { listSubtasks, updateSubtask } from "../api/subtasks";
import EventModal from "../components/EventModal.jsx";

function TodoCard({ todo, category, subs, expanded, onExpand, onToggle, onToggleSub, onEdit }) {
  const done = subs.filter((s) => s.done).length;
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow"
      style={{ borderLeft: `4px solid ${todo.color}` }}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={Boolean(todo.completed)}
          onChange={() => onToggle(todo)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-emerald-500"
        />
        <button onClick={() => onEdit(todo)} className="min-w-0 flex-1 text-left">
          <p
            className={`break-words font-semibold ${
              todo.completed ? "text-slate-400 line-through" : "text-slate-800"
            }`}
          >
            {todo.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {category && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${category.color}1a`, color: category.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
              </span>
            )}
            {todo.description && (
              <span className="truncate text-xs text-slate-400">{todo.description}</span>
            )}
          </div>
        </button>
        {subs.length > 0 && (
          <button
            onClick={() => onExpand(todo.id)}
            className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-slate-50 ${
              done === subs.length ? "text-emerald-500" : "text-indigo-500"
            }`}
          >
            ☑ {done}/{subs.length}
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="3"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        )}
      </div>

      {expanded && subs.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 pl-8">
          {subs.map((st) => (
            <label
              key={st.id}
              className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={st.done}
                onChange={() => onToggleSub(st)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-500"
              />
              <span
                className={`text-sm ${st.done ? "text-slate-400 line-through" : "text-slate-600"}`}
              >
                {st.title}
              </span>
            </label>
          ))}
        </div>
      )}

      {todo.image && (
        <img
          src={todo.image}
          alt=""
          className="mt-3 max-h-40 w-full rounded-lg border border-slate-100 object-contain"
        />
      )}
    </div>
  );
}

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("active"); // active | all

  function load() {
    listEvents()
      .then((data) => setTodos(data.filter((e) => e.is_task)))
      .catch(() => setTodos([]));
    listSubtasks()
      .then(setSubtasks)
      .catch(() => setSubtasks([]));
  }

  useEffect(() => {
    load();
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const subsByEvent = {};
  for (const st of subtasks) (subsByEvent[st.event_id] ??= []).push(st);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleTodo(todo) {
    await setEventCompleted(todo.id, !todo.completed);
    load();
  }

  async function toggleSub(st) {
    await updateSubtask(st.id, { done: !st.done });
    load();
  }

  function openNew() {
    setEditing({ is_task: true });
    setModalOpen(true);
  }

  const visible = todos
    .filter((t) => (filter === "active" ? !t.completed : true))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || b.id - a.id);

  const doneCount = todos.filter((t) => t.completed).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">待辦清單</h1>
          <p className="mt-1 text-sm text-slate-500">
            沒有特定時間的事情，做完打個勾。共 {todos.length} 項、完成 {doneCount}。
          </p>
        </div>
        <button
          onClick={openNew}
          className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95"
        >
          ＋ 新增待辦
        </button>
      </div>

      {/* 篩選 */}
      <div className="flex w-fit rounded-xl bg-slate-100 p-1 text-sm font-medium">
        {[
          ["active", "未完成"],
          ["all", "全部"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-4 py-1.5 transition ${
              filter === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 清單 */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 py-20 text-center">
          <span className="text-5xl">🗒️</span>
          <p className="font-bold text-slate-600">
            {filter === "active" && todos.length > 0 ? "全部完成了，太棒了！" : "還沒有待辦"}
          </p>
          <p className="text-sm text-slate-400">點右上角「＋ 新增待辦」記下第一件事</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              category={categories.find((c) => c.id === todo.category_id)}
              subs={subsByEvent[todo.id] ?? []}
              expanded={expanded.has(todo.id)}
              onExpand={toggleExpand}
              onToggle={toggleTodo}
              onToggleSub={toggleSub}
              onEdit={(t) => {
                setEditing(t);
                setModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <EventModal
        open={modalOpen}
        initial={editing}
        categories={categories}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={load}
      />
    </div>
  );
}
