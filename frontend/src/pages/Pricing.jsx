import { useEffect, useMemo, useState } from "react";
import {
  addOption,
  createProject,
  deleteOption,
  deleteProject,
  listProjects,
  markBought,
  markShopping,
  updateOption,
  updateProject,
} from "../api/pricing";

const EMOJIS = ["🛒", "💻", "🖥️", "📱", "⌨️", "🖱️", "🎧", "📷", "🪑", "🛋️", "🏠", "🚗", "👕", "🎮", "🔌", "🎁"];

function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  return "$" + Number(n).toLocaleString("en-US");
}

/* ---------- 候選（品牌/報價）表單 ---------- */

function OptionForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({
    brand: initial?.brand ?? "",
    name: initial?.name ?? "",
    price: initial?.price ?? "",
    store: initial?.store ?? "",
    url: initial?.url ?? "",
    note: initial?.note ?? "",
  });
  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  function submit() {
    const brand = f.brand.trim();
    const name = f.name.trim();
    if (!brand && !name) return; // 至少要有品牌或品名
    onSave({
      brand,
      name,
      price: f.price === "" ? null : Number(f.price),
      store: f.store.trim(),
      url: f.url.trim(),
      note: f.note.trim(),
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          className={field}
          placeholder="品牌 *（例：ASUS）"
          value={f.brand}
          onChange={(e) => setF({ ...f, brand: e.target.value })}
        />
        <input
          className={field}
          placeholder="型號/品名"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <input
          type="number"
          inputMode="decimal"
          className={field}
          placeholder="價格"
          value={f.price}
          onChange={(e) => setF({ ...f, price: e.target.value })}
        />
        <input
          className={field}
          placeholder="通路（PChome、蝦皮…）"
          value={f.store}
          onChange={(e) => setF({ ...f, store: e.target.value })}
        />
      </div>
      <input
        className={field}
        placeholder="連結（可留空）"
        value={f.url}
        onChange={(e) => setF({ ...f, url: e.target.value })}
      />
      <input
        className={field}
        placeholder="備註（可留空）"
        value={f.note}
        onChange={(e) => setF({ ...f, note: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 active:scale-95"
        >
          儲存
        </button>
      </div>
    </div>
  );
}

/* ---------- 一列候選 ---------- */

function OptionRow({ opt, cheapest, onEdit, onDelete }) {
  const title = [opt.brand, opt.name].filter(Boolean).join("｜") || "（未命名）";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        cheapest ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-slate-800">{title}</span>
          {cheapest && (
            <span className="shrink-0 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              最低價
            </span>
          )}
        </div>
        {(opt.store || opt.note) && (
          <p className="truncate text-xs text-slate-400">
            {[opt.store, opt.note].filter(Boolean).join("・")}
          </p>
        )}
      </div>
      <span className={`shrink-0 text-sm font-bold ${cheapest ? "text-emerald-600" : "text-slate-700"}`}>
        {fmt(opt.price)}
      </span>
      {opt.url && (
        <a
          href={opt.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
          title="開啟連結"
        >
          ↗
        </a>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
        title="編輯"
      >
        ✏️
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
        title="刪除"
      >
        ✕
      </button>
    </div>
  );
}

/* ---------- 購買資訊 Modal ---------- */

function BuyModal({ project, onClose, onDone }) {
  const opts = project.options ?? [];
  const [optionId, setOptionId] = useState(project.bought_option_id ?? (opts[0]?.id ?? null));
  const [brand, setBrand] = useState(project.bought_brand ?? "");
  const [price, setPrice] = useState(
    project.bought_price === null || project.bought_price === undefined ? "" : project.bought_price
  );
  const [dateStr, setDateStr] = useState(project.bought_date ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // 選候選時，自動帶入品牌與價格
  function pick(o) {
    setOptionId(o.id);
    setBrand((o.brand || o.name || "").trim());
    if (o.price !== null && o.price !== undefined) setPrice(o.price);
  }

  async function confirm() {
    setSaving(true);
    try {
      const updated = await markBought(project.id, {
        option_id: optionId,
        brand: brand.trim(),
        price: price === "" ? null : Number(price),
        date: dateStr || null,
      });
      onDone(updated);
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-slate-900">
          {project.emoji} {project.name}｜記錄購買
        </h2>
        <p className="mt-1 text-xs text-slate-400">選一個候選帶入品牌與價格，或自己填。</p>

        {opts.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs font-bold text-slate-500">選擇購買的候選</p>
            {opts.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                  optionId === o.id
                    ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {[o.brand, o.name].filter(Boolean).join("｜") || "（未命名）"}
                </span>
                <span className="shrink-0 text-sm font-bold text-slate-600">{fmt(o.price)}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOptionId(null)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                optionId === null
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              ✏️ 自己輸入（不對應候選）
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-500">買的品牌</label>
            <input className={field} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="例：ASUS" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">價格</label>
            <input
              type="number"
              inputMode="decimal"
              className={field}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="例：25900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">購買日期</label>
            <input type="date" className={field} value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-200 hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
          >
            {saving ? "儲存中…" : "✓ 標記已購買"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 專案（名稱/emoji/備註）Modal ---------- */

function ProjectModal({ project, onClose, onSaved }) {
  const isEdit = Boolean(project?.id);
  const [name, setName] = useState(project?.name ?? "");
  const [emoji, setEmoji] = useState(project?.emoji ?? "🛒");
  const [note, setNote] = useState(project?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), emoji, note: note.trim() };
      const res = isEdit ? await updateProject(project.id, payload) : await createProject(payload);
      onSaved(res);
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-slate-900">{isEdit ? "編輯比價專案" : "新增比價專案"}</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">名稱 *</label>
            <input autoFocus className={field} placeholder="例：筆電、螢幕、掃地機" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">圖示</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition ${
                    emoji === e ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">備註</label>
            <textarea className={field} rows={2} placeholder="需求、預算…（可留空）" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || saving}
            className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            {saving ? "儲存中…" : isEdit ? "儲存變更" : "新增"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 專案卡片 ---------- */

function ProjectCard({ project, onChange, onEditProject, onDeleteProject, onBuy }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const bought = project.status === "bought";
  const opts = project.options ?? [];
  const cheapestId = useMemo(() => {
    let id = null;
    let min = Infinity;
    for (const o of opts) {
      if (o.price !== null && o.price !== undefined && o.price < min) {
        min = o.price;
        id = o.id;
      }
    }
    return id;
  }, [opts]);

  async function addOpt(payload) {
    await addOption(project.id, payload);
    setAdding(false);
    onChange();
  }
  async function saveOpt(id, payload) {
    await updateOption(id, payload);
    setEditingId(null);
    onChange();
  }
  async function delOpt(id) {
    await deleteOption(id);
    onChange();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 標題列 */}
      <div className="flex items-start gap-3 p-4">
        <span className="text-2xl">{project.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-slate-900">{project.name}</h3>
            {bought ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ 已購買</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">🛒 未購買</span>
            )}
          </div>
          {project.note && <p className="mt-0.5 text-xs text-slate-400">{project.note}</p>}
          {bought ? (
            <p className="mt-1 text-sm text-slate-600">
              買了 <span className="font-bold text-slate-800">{project.bought_brand || "（未填品牌）"}</span>
              {project.bought_price !== null && project.bought_price !== undefined && (
                <span className="font-bold text-emerald-600">・{fmt(project.bought_price)}</span>
              )}
              {project.bought_date && <span className="text-slate-400">・{project.bought_date}</span>}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              {opts.length > 0 ? (
                <>
                  {opts.length} 個報價・最低{" "}
                  <span className="font-bold text-emerald-600">{fmt(project.min_price)}</span>
                  {project.max_price !== project.min_price && <span className="text-slate-400"> ~ {fmt(project.max_price)}</span>}
                </>
              ) : (
                <span className="text-slate-400">還沒有報價</span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onEditProject(project)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
              title="編輯專案"
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={() => onDeleteProject(project)}
              className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
              title="刪除專案"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* 動作列 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          {open ? "▾ 收合報價" : `▸ 報價與品牌（${opts.length}）`}
        </button>
        <div className="ml-auto flex gap-2">
          {bought ? (
            <>
              <button
                type="button"
                onClick={() => onBuy(project)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                改購買資訊
              </button>
              <button
                type="button"
                onClick={async () => {
                  await markShopping(project.id);
                  onChange();
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50"
              >
                改回未購買
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onBuy(project)}
              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 active:scale-95"
            >
              ✓ 標記已購買
            </button>
          )}
        </div>
      </div>

      {/* 報價清單 */}
      {open && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-4">
          {opts.map((o) =>
            editingId === o.id ? (
              <OptionForm
                key={o.id}
                initial={o}
                onSave={(payload) => saveOpt(o.id, payload)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <OptionRow
                key={o.id}
                opt={o}
                cheapest={o.id === cheapestId && opts.length > 1}
                onEdit={() => setEditingId(o.id)}
                onDelete={() => delOpt(o.id)}
              />
            )
          )}
          {adding ? (
            <OptionForm onSave={addOpt} onCancel={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded-lg border-2 border-dashed border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-400 transition hover:border-indigo-300 hover:text-indigo-600"
            >
              ＋ 新增品牌 / 報價
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 主頁 ---------- */

export default function Pricing() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [projectModal, setProjectModal] = useState(null); // {project} | {project:null}（新增）
  const [buyProject, setBuyProject] = useState(null);

  function load() {
    setLoading(true);
    listProjects()
      .then((d) => setProjects(d ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      all: projects.length,
      shopping: projects.filter((p) => p.status === "shopping").length,
      bought: projects.filter((p) => p.status === "bought").length,
    }),
    [projects]
  );

  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  async function handleDeleteProject(p) {
    if (!window.confirm(`確定刪除「${p.name}」？底下的報價也會一起刪除。`)) return;
    await deleteProject(p.id);
    load();
  }

  const TABS = [
    { key: "all", label: "全部" },
    { key: "shopping", label: "未購買" },
    { key: "bought", label: "已購買" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">比價</h1>
          <p className="mt-1 text-sm text-slate-500">建立想買的東西，收集各家品牌報價，買了就記錄下來。</p>
        </div>
        <button
          onClick={() => setProjectModal({ project: null })}
          className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-110 active:scale-95"
        >
          ＋ 新增專案
        </button>
      </div>

      {/* 篩選 */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              filter === t.key ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}（{counts[t.key]}）
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">載入中…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <p className="text-4xl">🛒</p>
          <p className="mt-3 text-sm text-slate-500">
            {filter === "bought" ? "還沒有已購買的項目。" : "還沒有比價專案，點右上角新增一個吧。"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onChange={load}
              onEditProject={(pr) => setProjectModal({ project: pr })}
              onDeleteProject={handleDeleteProject}
              onBuy={(pr) => setBuyProject(pr)}
            />
          ))}
        </div>
      )}

      {projectModal && (
        <ProjectModal
          project={projectModal.project}
          onClose={() => setProjectModal(null)}
          onSaved={() => {
            setProjectModal(null);
            load();
          }}
        />
      )}

      {buyProject && (
        <BuyModal
          project={buyProject}
          onClose={() => setBuyProject(null)}
          onDone={() => {
            setBuyProject(null);
            load();
          }}
        />
      )}
    </div>
  );
}
