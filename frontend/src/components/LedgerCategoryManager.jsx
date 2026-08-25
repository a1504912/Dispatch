import { useEffect, useState } from "react";
import {
  listLedgerCategories,
  createLedgerCategory,
  updateLedgerCategory,
  deleteLedgerCategory,
} from "../api/ledgerCategories";

const EMOJI_CHOICES = [
  "🍜","🍔","☕","🛒","🚗","⛽","🚌","🛍️","👕","🎮","🎬","🎵","🏠","💡","💧","📱",
  "💊","🏥","📚","✏️","🎁","💳","🐶","✈️","💰","🎉","📈","↩️","💵","💼","🧾","📦",
];

export default function LedgerCategoryManager({ open, onClose, onChanged }) {
  const [cats, setCats] = useState([]);
  const [kind, setKind] = useState("expense");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📦");
  const [emojiPickerFor, setEmojiPickerFor] = useState(null); // "new" | cat.id
  const [expandedId, setExpandedId] = useState(null); // 展開哪個主分類看次分類
  const [subName, setSubName] = useState(""); // 目前輸入中的次分類名

  function refresh() {
    listLedgerCategories()
      .then(setCats)
      .catch(() => setCats([]));
  }
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  const tops = cats.filter((c) => c.kind === kind && !c.parent_id);
  const subsOf = (pid) => cats.filter((c) => c.parent_id === pid);

  async function addTop() {
    if (!newName.trim()) return;
    await createLedgerCategory({ kind, name: newName.trim(), emoji: newEmoji || "📦", sort: cats.length });
    setNewName("");
    setNewEmoji("📦");
    setEmojiPickerFor(null);
    refresh();
    onChanged?.();
  }

  async function addSub(parent) {
    if (!subName.trim()) return;
    await createLedgerCategory({
      kind: parent.kind,
      name: subName.trim(),
      emoji: parent.emoji,
      parent_id: parent.id,
      sort: cats.length,
    });
    setSubName("");
    refresh();
    onChanged?.();
  }

  async function rename(cat, name) {
    if (!name.trim() || name === cat.name) return;
    await updateLedgerCategory(cat.id, { ...cat, name: name.trim() });
    refresh();
    onChanged?.();
  }

  async function setEmoji(cat, emoji) {
    await updateLedgerCategory(cat.id, { ...cat, emoji });
    setEmojiPickerFor(null);
    refresh();
    onChanged?.();
  }

  async function remove(cat, isSub) {
    const msg = isSub
      ? `刪除次分類「${cat.name}」？`
      : `刪除主分類「${cat.name}」？（底下的次分類也會一起刪除）`;
    if (!window.confirm(msg)) return;
    await deleteLedgerCategory(cat.id);
    refresh();
    onChanged?.();
  }

  const field =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  const EmojiPalette = ({ onPick, up }) => (
    <div className={`absolute z-10 ${up ? "bottom-full mb-1" : "mt-1"} grid w-64 grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl`}>
      {EMOJI_CHOICES.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} className="rounded-md p-1 text-lg hover:bg-slate-100">
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">分類管理</h2>
          <button onClick={onClose} className="rounded-md px-2 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {["expense", "income"].map((k) => (
              <button key={k} onClick={() => { setKind(k); setEmojiPickerFor(null); setExpandedId(null); }}
                className={`flex-1 rounded-lg px-4 py-1.5 transition ${kind === k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
                {k === "expense" ? "支出" : "收入"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">點主分類的「▸」可展開，管理底下的次分類（例：飲食 → 早餐／午餐）。</p>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-3">
          {tops.map((cat) => {
            const subs = subsOf(cat.id);
            const isOpen = expandedId === cat.id;
            return (
              <div key={cat.id} className="rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => { setExpandedId(isOpen ? null : cat.id); setSubName(""); }}
                    className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`}
                    title="展開次分類"
                  >
                    ▸
                  </button>
                  <div className="relative">
                    <button type="button" onClick={() => setEmojiPickerFor(emojiPickerFor === cat.id ? null : cat.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg ring-1 ring-slate-200 hover:bg-slate-100">
                      {cat.emoji}
                    </button>
                    {emojiPickerFor === cat.id && <EmojiPalette onPick={(e) => setEmoji(cat, e)} />}
                  </div>
                  <input defaultValue={cat.name} onBlur={(e) => rename(cat, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className={`${field} flex-1`} />
                  {subs.length > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">{subs.length}</span>
                  )}
                  <button onClick={() => remove(cat, false)} className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-red-50 hover:text-red-500">🗑</button>
                </div>

                {isOpen && (
                  <div className="space-y-1.5 border-t border-slate-100 px-3 py-2 pl-9">
                    {subs.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="text-slate-300">•</span>
                        <input defaultValue={s.name} onBlur={(e) => rename(s, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className={`${field} flex-1`} />
                        <button onClick={() => remove(s, true)} className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-red-50 hover:text-red-500">🗑</button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300">•</span>
                      <input value={subName} onChange={(e) => setSubName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSub(cat)} placeholder="新增次分類，例：早餐" className={`${field} flex-1`} />
                      <button onClick={() => addSub(cat)} disabled={!subName.trim()}
                        className="shrink-0 rounded-lg bg-slate-700 px-3 py-1 text-sm font-bold text-white hover:bg-slate-600 disabled:opacity-40">＋</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {tops.length === 0 && <p className="py-6 text-center text-sm text-slate-400">還沒有分類，在下面新增。</p>}
        </div>

        {/* 新增主分類 */}
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button type="button" onClick={() => setEmojiPickerFor(emojiPickerFor === "new" ? null : "new")}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg ring-1 ring-slate-200 hover:bg-slate-100">
                {newEmoji}
              </button>
              {emojiPickerFor === "new" && <EmojiPalette up onPick={(e) => { setNewEmoji(e); setEmojiPickerFor(null); }} />}
            </div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTop()}
              placeholder={`新增${kind === "expense" ? "支出" : "收入"}主分類`} className={`${field} flex-1`} />
            <button onClick={addTop} disabled={!newName.trim()}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">＋</button>
          </div>
        </div>
      </div>
    </div>
  );
}
