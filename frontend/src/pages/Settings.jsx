import { useEffect, useState } from "react";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../api/categories";

const CATEGORY_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#64748b",
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full transition ${
            value === c ? "ring-2 ring-slate-800 ring-offset-1" : "hover:scale-110"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

/** 設定頁的通用區塊卡片，之後新增設定就加一個 <SettingSection>。 */
function SettingSection({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CategorySettings() {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", color: "" });

  async function refresh() {
    try {
      setCategories(await listCategories());
    } catch {
      setCategories([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createCategory({ name: newName.trim(), color: newColor });
    setNewName("");
    refresh();
  }

  async function handleDelete(cat) {
    if (!window.confirm(`確定要刪除分類「${cat.name}」嗎？使用中的行程會變成未分類。`)) return;
    await deleteCategory(cat.id);
    refresh();
  }

  async function handleSaveEdit(id) {
    if (!editForm.name.trim()) return;
    await updateCategory(id, { name: editForm.name.trim(), color: editForm.color });
    setEditingId(null);
    refresh();
  }

  const field =
    "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="space-y-4">
      {/* 新增 */}
      <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-3">
        <input
          className={`${field} w-44`}
          placeholder="新分類名稱，例：工作"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <ColorPicker value={newColor} onChange={setNewColor} />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          ＋ 新增分類
        </button>
      </form>

      {/* 列表 */}
      {categories.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          還沒有分類。建議先建立幾個，例如：工作、自己的事、家裡的事、出遊。
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {categories.map((cat) =>
            editingId === cat.id ? (
              <li key={cat.id} className="flex flex-wrap items-center gap-3 py-3">
                <input
                  className={`${field} w-44`}
                  value={editForm.name}
                  autoFocus
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
                <ColorPicker
                  value={editForm.color}
                  onChange={(c) => setEditForm({ ...editForm, color: c })}
                />
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleSaveEdit(cat.id)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-700"
                  >
                    儲存
                  </button>
                </div>
              </li>
            ) : (
              <li key={cat.id} className="flex items-center gap-3 py-3">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="font-medium text-slate-800">{cat.name}</span>
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditForm({ name: cat.name, color: cat.color });
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className="rounded-lg px-3 py-1.5 text-sm text-red-500 transition hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">設定</h1>
        <p className="mt-1 text-sm text-slate-500">管理 Dispatch 的分類與偏好設定。</p>
      </div>

      <SettingSection
        title="🏷️ 行程分類"
        description="建立自己的分類（工作、家裡、出遊…），行程可以掛上分類，總覽頁就能用分類篩選。"
      >
        <CategorySettings />
      </SettingSection>

      {/* 之後的新設定往下加 SettingSection 即可 */}
      <SettingSection title="🚧 更多設定" description="陸續加入中——想到要什麼就告訴開發者。">
        <p className="text-sm text-slate-400">
          預留位置：Ollama 模型管理、Google 同步偏好、通知、資料備份…
        </p>
      </SettingSection>
    </div>
  );
}
