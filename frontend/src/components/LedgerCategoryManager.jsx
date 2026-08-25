import { useEffect, useState } from "react";
import {
  listLedgerCategories,
  createLedgerCategory,
  updateLedgerCategory,
  deleteLedgerCategory,
} from "../api/ledgerCategories";

// 快速選 emoji 的小面板（也可直接在輸入框打字貼上任何 emoji）
const EMOJI_CHOICES = [
  "🍜","🍔","☕","🛒","🚗","⛽","🚌","🛍️","👕","🎮","🎬","🎵","🏠","💡","💧","📱",
  "💊","🏥","📚","✏️","🎁","💳","🐶","✈️","💰","🎉","📈","↩️","💵","💼","🧾","📦",
];

export default function LedgerCategoryManager({ open, onClose, onChanged }) {
  const [cats, setCats] = useState([]);
  const [kind, setKind] = useState("expense");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📦");
  const [emojiPickerFor, setEmojiPickerFor] = useState(null); // "new" | cat.id | null

  function refresh() {
    listLedgerCategories()
      .then(setCats)
      .catch(() => setCats([]));
  }
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  const rows = cats.filter((c) => c.kind === kind);

  async function handleAdd() {
    if (!newName.trim()) return;
    const sort = cats.length;
    await createLedgerCategory({ kind, name: newName.trim(), emoji: newEmoji || "📦", sort });
    setNewName("");
    setNewEmoji("📦");
    setEmojiPickerFor(null);
    refresh();
    onChanged?.();
  }

  async function handleRename(cat, name) {
    if (!name.trim() || name === cat.name) return;
    await updateLedgerCategory(cat.id, { ...cat, name: name.trim() });
    refresh();
    onChanged?.();
  }

  async function handleEmoji(cat, emoji) {
    await updateLedgerCategory(cat.id, { ...cat, emoji });
    setEmojiPickerFor(null);
    refresh();
    onChanged?.();
  }

  async function handleDelete(cat) {
    if (!window.confirm(`刪除分類「${cat.name}」？（已記錄的帳目不受影響）`)) return;
    await deleteLedgerCategory(cat.id);
    refresh();
    onChanged?.();
  }

  const field =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  const EmojiPalette = ({ onPick }) => (
    <div className="absolute z-10 mt-1 grid w-64 grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      {EMOJI_CHOICES.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="rounded-md p-1 text-lg hover:bg-slate-100"
        >
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">分類管理</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {/* 支出 / 收入 切換 */}
        <div className="px-5 pt-4">
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {["expense", "income"].map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setEmojiPickerFor(null);
                }}
                className={`flex-1 rounded-lg px-4 py-1.5 transition ${
                  kind === k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                }`}
              >
                {k === "expense" ? "支出" : "收入"}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {rows.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setEmojiPickerFor(emojiPickerFor === cat.id ? null : cat.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg ring-1 ring-slate-200 hover:bg-slate-100"
                  title="換 emoji"
                >
                  {cat.emoji}
                </button>
                {emojiPickerFor === cat.id && (
                  <EmojiPalette onPick={(e) => handleEmoji(cat, e)} />
                )}
              </div>
              <input
                defaultValue={cat.name}
                onBlur={(e) => handleRename(cat, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={`${field} flex-1`}
              />
              <button
                onClick={() => handleDelete(cat)}
                className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                title="刪除"
              >
                🗑
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">還沒有分類，在下面新增一個。</p>
          )}
        </div>

        {/* 新增 */}
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmojiPickerFor(emojiPickerFor === "new" ? null : "new")}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg ring-1 ring-slate-200 hover:bg-slate-100"
              >
                {newEmoji}
              </button>
              {emojiPickerFor === "new" && (
                <div className="absolute bottom-full left-0 mb-1">
                  <EmojiPalette
                    onPick={(e) => {
                      setNewEmoji(e);
                      setEmojiPickerFor(null);
                    }}
                  />
                </div>
              )}
            </div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={`新增${kind === "expense" ? "支出" : "收入"}分類`}
              className={`${field} flex-1`}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-indigo-700 active:scale-95 disabled:opacity-40"
            >
              ＋
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
