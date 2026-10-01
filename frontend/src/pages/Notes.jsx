import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  addText,
  commitEncryption,
  createNotebook,
  deleteItem,
  deleteNotebook,
  editItem,
  fetchMediaBytes,
  listItems,
  listNotebooks,
  mediaUrl,
  stageEncryptedBlob,
  updateNotebook,
  uploadFile,
} from "../api/notes";
import { openImage } from "../lightbox";
import {
  cryptoSupported,
  decryptBytes,
  decryptText,
  deriveKey,
  encryptBytes,
  encryptText,
  makeCheck,
  newSalt,
  unlockKey,
} from "../notesCrypto";

const EMOJIS = ["📒", "💼", "💡", "🛒", "✈️", "🏠", "💰", "🎮", "📚", "🍽️", "❤️", "🔒", "📷", "🎵", "🧾", "⭐"];
const PAGE = 60;
const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/gi;

/* ---------- 小工具 ---------- */
const pad = (n) => String(n).padStart(2, "0");
function fmtTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "今天";
  if (d.toDateString() === y.toDateString()) return "昨天";
  const wk = "日一二三四五六"[d.getDay()];
  return d.getFullYear() === t.getFullYear()
    ? `${d.getMonth() + 1}/${d.getDate()}（${wk}）`
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${wk}）`;
}
function listTime(iso) {
  const d = new Date(iso);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return fmtTime(iso);
  if (d.getFullYear() === t.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Linkified({ text }) {
  const parts = text.split(URL_SPLIT);
  return parts.map((p, i) =>
    /^https?:\/\//i.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-indigo-600 underline underline-offset-2">
        {p}
      </a>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    )
  );
}

/* ---------- 加密記事本：解密 ---------- */
async function decryptItem(key, it) {
  const out = { ...it };
  try {
    out.text = it.text ? await decryptText(key, it.text) : "";
    if (it.kind === "enc") {
      const m = JSON.parse(await decryptText(key, it.meta?.enc || ""));
      const t = (m.type || "").toLowerCase();
      out.kind = t.startsWith("image/") ? "image" : t.startsWith("video/") ? "video" : "file";
      out.encMedia = true;
      out.media_name = m.name || "file";
      out.media_type = m.type || "application/octet-stream";
      out.media_size = m.size || it.media_size;
      out.meta = null;
    }
  } catch {
    Object.assign(out, { text: "（這則無法解密）", kind: "text", encMedia: false, media_url: null, meta: null });
  }
  return out;
}
const decryptAll = (key, rows) => Promise.all(rows.map((r) => decryptItem(key, r)));

// 加密的照片/影片/檔案：下載亂碼 → 在瀏覽器解密 → 用暫時網址顯示
function EncMedia({ item, cryptoKey }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState("idle"); // idle / loading / err
  const urlRef = useRef("");

  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), []);

  async function load() {
    if (urlRef.current) return urlRef.current;
    setState("loading");
    try {
      const buf = await fetchMediaBytes(item.media_url);
      const plain = await decryptBytes(cryptoKey, buf);
      const u = URL.createObjectURL(new Blob([plain], { type: item.media_type || "application/octet-stream" }));
      urlRef.current = u;
      setUrl(u);
      setState("idle");
      return u;
    } catch {
      setState("err");
      return "";
    }
  }
  // 照片自動解密；影片、檔案比較大，點了才解密
  useEffect(() => {
    if (item.kind === "image") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function download() {
    const u = await load();
    if (!u) return;
    const a = document.createElement("a");
    a.href = u;
    a.download = item.media_name || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (state === "err") return <p className="px-3.5 py-3 text-xs text-red-500">🔐 解密失敗（檔案可能損壞）</p>;
  if (item.kind === "image") {
    return url ? (
      <img src={url} alt="" onClick={() => openImage(url)} className="block max-h-80 w-auto max-w-full cursor-zoom-in object-contain" />
    ) : (
      <div className="flex h-40 w-56 items-center justify-center text-xs text-slate-500">🔐 解密中…</div>
    );
  }
  if (item.kind === "video") {
    return url ? (
      <video src={url} controls autoPlay playsInline className="block max-h-80 w-full max-w-md bg-black" />
    ) : (
      <button onClick={load} className="flex h-40 w-64 max-w-full flex-col items-center justify-center gap-1 bg-slate-800 text-white">
        <span className="text-3xl">▶</span>
        <span className="text-xs">{state === "loading" ? "解密中…" : `點一下解密播放（${fmtSize(item.media_size)}）`}</span>
      </button>
    );
  }
  return (
    <button onClick={download} className="flex items-center gap-3 px-3.5 py-3 text-left hover:bg-emerald-200/50">
      <span className="text-2xl">📎</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{item.media_name}</span>
        <span className="text-xs text-slate-500">
          {fmtSize(item.media_size)}・{state === "loading" ? "解密中…" : "點一下解密下載"}
        </span>
      </span>
    </button>
  );
}

/* ---------- 一則內容（泡泡） ---------- */
function Bubble({ item, cryptoKey, onDelete, onSaveEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const src = mediaUrl(item.media_url);
  const canEdit = item.kind === "text" || item.kind === "link" || item.kind === "image" || item.kind === "video";

  async function save() {
    await onSaveEdit(item, draft);
    setEditing(false);
  }

  return (
    <div className="group flex justify-end gap-2">
      {/* 動作（滑過顯示；手機長按不方便，所以一直半透明顯示） */}
      <div className="flex shrink-0 flex-col justify-end gap-1 pb-4 opacity-40 transition group-hover:opacity-100">
        {item.text && (
          <button title="複製文字" onClick={() => navigator.clipboard?.writeText(item.text)} className="rounded px-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ⧉
          </button>
        )}
        {canEdit && !editing && (
          <button title="編輯" onClick={() => { setDraft(item.text); setEditing(true); }} className="rounded px-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
            ✎
          </button>
        )}
        <button title="刪除" onClick={() => onDelete(item)} className="rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">
          ✕
        </button>
      </div>

      <div className="flex max-w-[80%] flex-col items-end">
        <div className="overflow-hidden rounded-2xl rounded-tr-md bg-emerald-100 text-sm text-slate-800 shadow-sm">
          {item.encMedia && <EncMedia item={item} cryptoKey={cryptoKey} />}
          {!item.encMedia && item.kind === "image" && src && (
            <img src={src} alt="" loading="lazy" onClick={() => openImage(src)} className="block max-h-80 w-auto max-w-full cursor-zoom-in object-contain" />
          )}
          {!item.encMedia && item.kind === "video" && src && (
            <video src={src} controls preload="metadata" playsInline className="block max-h-80 w-full max-w-md bg-black" />
          )}
          {!item.encMedia && item.kind === "file" && (
            <a href={mediaUrl(item.media_url, true)} className="flex items-center gap-3 px-3.5 py-3 hover:bg-emerald-200/50">
              <span className="text-2xl">📎</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.media_name}</span>
                <span className="text-xs text-slate-500">{fmtSize(item.media_size)}・點一下下載</span>
              </span>
            </a>
          )}

          {editing ? (
            <div className="space-y-1.5 p-2">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                className="w-64 max-w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setEditing(false)} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-white/60">取消</button>
                <button onClick={save} disabled={item.kind !== "image" && item.kind !== "video" && !draft.trim()} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40">
                  儲存
                </button>
              </div>
            </div>
          ) : (
            item.text && (
              <p className="whitespace-pre-wrap break-words px-3.5 py-2">
                <Linkified text={item.text} />
              </p>
            )
          )}

          {item.kind === "link" && item.meta && (item.meta.title || item.meta.image) && (
            <a href={item.meta.url} target="_blank" rel="noreferrer" className="block border-t border-emerald-200 bg-white/70 hover:bg-white">
              {item.meta.image && (
                <img src={item.meta.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-36 w-full max-w-sm object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <span className="block max-w-sm px-3.5 py-2">
                {item.meta.title && <span className="line-clamp-2 block font-bold text-slate-800">{item.meta.title}</span>}
                {item.meta.description && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{item.meta.description}</span>}
                <span className="mt-1 block text-[11px] text-slate-400">{hostOf(item.meta.url)}</span>
              </span>
            </a>
          )}
        </div>
        <span className="mt-0.5 text-[10px] text-slate-400">{fmtTime(item.created_at)}</span>
      </div>
    </div>
  );
}

/* ---------- 既有記事本改成加密（全部在瀏覽器加密） ---------- */
async function encryptExisting(nbId, password, onStep) {
  const salt = newSalt();
  const key = await deriveKey(password, salt);
  const enc_check = await makeCheck(key);

  // 1) 拿到全部內容
  let all = [];
  let before = null;
  for (;;) {
    const rows = await listItems(nbId, before, 200);
    all = [...rows, ...all];
    if (rows.length < 200) break;
    before = rows[0].id;
  }

  // 2) 逐則加密；有檔案的先下載、加密、上傳成暫存檔（資料庫還沒動）
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const it = all[i];
    onStep(`加密中 ${i + 1} / ${all.length}`);
    const entry = { id: it.id, text: it.text ? await encryptText(key, it.text) : "" };
    if (it.media_url) {
      onStep(`下載第 ${i + 1} / ${all.length} 則的檔案…`);
      const buf = await fetchMediaBytes(it.media_url);
      const blob = await encryptBytes(key, buf);
      entry.enc_meta = await encryptText(
        key,
        JSON.stringify({ name: it.media_name, type: it.media_type || "application/octet-stream", size: it.media_size })
      );
      entry.blob = await stageEncryptedBlob(nbId, blob, (p) =>
        onStep(`上傳第 ${i + 1} / ${all.length} 則（${Math.round(p * 100)}%）`)
      );
    }
    out.push(entry);
  }

  // 3) 一次換掉；失敗的話原本內容不變
  onStep("最後確認中…");
  const nb = await commitEncryption(nbId, { enc_salt: salt, enc_check, items: out });
  return { nb, key };
}

/* ---------- 新增 / 設定 記事本 ---------- */
function NotebookModal({ initial, showHidden, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "📒");
  const [pinned, setPinned] = useState(Boolean(initial?.pinned));
  const [hidden, setHidden] = useState(Boolean(initial?.hidden));
  const [saving, setSaving] = useState(false);
  // 加密（只能在建立時設定）
  const [encrypt, setEncrypt] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false);
  const [step, setStep] = useState(""); // 既有記事本加密的進度
  const canEncrypt = !initial?.encrypted;
  const pwProblem = !encrypt
    ? ""
    : !cryptoSupported()
      ? "這個網址不支援加密（要用 https 網址開）"
      : pw1.length < 6
        ? "密碼至少 6 個字"
        : pw1 !== pw2
          ? "兩次密碼不一樣"
          : !ack
            ? "請勾選下面的確認"
            : "";

  async function save() {
    if (!name.trim() || saving || pwProblem) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), emoji, pinned, hidden };
      let key = null;
      if (!isEdit && encrypt) {
        const salt = newSalt();
        key = await deriveKey(pw1, salt);
        Object.assign(payload, { encrypted: true, enc_salt: salt, enc_check: await makeCheck(key) });
      }
      let nb = isEdit ? await updateNotebook(initial.id, payload) : await createNotebook(payload);
      if (isEdit && encrypt) {
        // 既有內容：在瀏覽器下載→加密→上傳，最後一次換掉
        setStep("準備中…");
        const r = await encryptExisting(initial.id, pw1, setStep);
        nb = r.nb;
        key = r.key;
      }
      onSaved(nb, key);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      window.alert(isEdit && encrypt ? `加密沒有完成，原本內容沒有變動。\n（${msg}）` : `儲存失敗：${msg}`);
    } finally {
      setSaving(false);
      setStep("");
    }
  }
  async function remove() {
    if (!window.confirm(`刪除「${initial.name}」？裡面的文字、照片、影片會全部刪除，無法復原。`)) return;
    await deleteNotebook(initial.id);
    onDeleted(initial.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !saving && onClose()}>
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-slate-900">{isEdit ? "記事本設定" : "新增記事本"}</h2>
        <div className="mt-4 space-y-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
            placeholder="名稱，例：工作筆記、旅遊、靈感"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${emoji === e ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-slate-50 hover:bg-slate-100"}`}>
                {e}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            📌 置頂
          </label>
          {/* 隱藏開關只有在「顯示隱藏」模式下才出現 */}
          {showHidden && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm text-slate-200">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-4 w-4 accent-amber-400" />
              🔒 隱藏這本（平常不顯示，要連點標題 5 下才看得到）
            </label>
          )}

          {!canEncrypt ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">🔐 這本是加密記事本，密碼建立後無法更改。</p>
          ) : (
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={encrypt} disabled={saving} onChange={(e) => setEncrypt(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                🔐 加密這本（用密碼加密，主機只存亂碼）
              </label>
              {encrypt && (
                <div className="mt-3 space-y-2">
                  {isEdit && (
                    <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600">
                      會把這本現有的 {initial.count} 則內容（含照片、影片、檔案）在你的裝置加密後重新上傳，影片多的話要等一下，過程中別關掉網頁。中途失敗原本內容不會變。網址的預覽圖會移除（連結本身保留）。
                    </p>
                  )}
                  <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="設定密碼（至少 6 個字）" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
                  <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再輸入一次" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-red-600" />
                    我了解：忘記密碼就永遠打不開，沒有任何方法能救回內容；密碼也之後無法更改。
                  </label>
                  {pwProblem && <p className="text-xs text-slate-500">{pwProblem}</p>}
                  {step && <p className="text-xs font-bold text-emerald-700">🔐 {step}</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <button onClick={remove} className="mr-auto rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              刪除
            </button>
          )}
          <button onClick={onClose} disabled={saving} className="ml-auto rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            取消
          </button>
          <button onClick={save} disabled={!name.trim() || saving || Boolean(pwProblem)} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 disabled:opacity-40">
            {saving ? (encrypt ? (isEdit ? "加密中…" : "產生金鑰中…") : "儲存中…") : isEdit ? (encrypt ? "加密並儲存" : "儲存") : "建立"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 主頁 ---------- */
export default function Notes() {
  const [showHidden, setShowHidden] = useState(false);
  const [notebooks, setNotebooks] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(0); // 送出中的則數
  const [uploads, setUploads] = useState([]); // [{key, name, pct, err}]
  const [modal, setModal] = useState(null); // {nb} | {nb:null}
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // 已解鎖的加密記事本金鑰（只在記憶體，重新整理就要重輸密碼）
  const [keys, setKeys] = useState({});
  const [unlockPw, setUnlockPw] = useState("");
  const [unlockErr, setUnlockErr] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const taps = useRef([]);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const stickBottom = useRef(true);

  const selected = notebooks.find((n) => n.id === selId) || null;
  const curKey = selected?.encrypted ? keys[selId] || null : null;
  const locked = Boolean(selected?.encrypted && !curKey);

  async function unlock() {
    if (!selected || !unlockPw || unlocking) return;
    if (!cryptoSupported()) {
      setUnlockErr("這個網址不支援解密，請用 https 網址開啟");
      return;
    }
    setUnlocking(true);
    setUnlockErr("");
    try {
      const key = await unlockKey(unlockPw, selected.enc_salt, selected.enc_check);
      if (!key) {
        setUnlockErr("密碼錯誤");
        return;
      }
      setKeys((k) => ({ ...k, [selected.id]: key }));
      setUnlockPw("");
    } finally {
      setUnlocking(false);
    }
  }
  function lockNow() {
    setKeys((k) => {
      const n = { ...k };
      delete n[selId];
      return n;
    });
    setItems([]);
  }

  function loadNotebooks(hidden = showHidden) {
    return listNotebooks(hidden)
      .then((rows) => {
        setNotebooks(rows);
        return rows;
      })
      .catch(() => setNotebooks([]))
      .finally(() => setLoadingList(false));
  }
  useEffect(() => {
    loadNotebooks(showHidden).then((rows) => {
      // 收起隱藏模式時，若正開著隱藏的那本就關掉
      if (rows && selId && !rows.some((n) => n.id === selId)) setSelId(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden]);

  // 連點標題 5 下（2 秒內）切換顯示隱藏的記事本
  function tapTitle() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setShowHidden((v) => {
        flash(!v ? "🔓 已顯示隱藏的記事本" : "🔒 已收起隱藏的記事本");
        return !v;
      });
    }
  }
  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  // 開啟某本：載入最新一頁
  const selEncrypted = Boolean(selected?.encrypted);
  useEffect(() => {
    setUnlockErr("");
    setUnlockPw("");
    if (!selId) return;
    if (selEncrypted && !curKey) {
      setItems([]);
      return; // 等使用者輸入密碼
    }
    let alive = true;
    setLoadingItems(true);
    setItems([]);
    stickBottom.current = true;
    listItems(selId, null, PAGE)
      .then(async (rows) => {
        const out = curKey ? await decryptAll(curKey, rows) : rows;
        if (!alive) return;
        setItems(out);
        setHasMore(rows.length === PAGE);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoadingItems(false));
    return () => {
      alive = false;
    };
  }, [selId, selEncrypted, curKey]);

  // 新內容進來就捲到最底（載入更早的除外）
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, uploads]);

  async function loadOlder() {
    if (!items.length) return;
    const el = scrollRef.current;
    const prevH = el?.scrollHeight || 0;
    stickBottom.current = false;
    const rows = await listItems(selId, items[0].id, PAGE);
    setHasMore(rows.length === PAGE);
    const out = curKey ? await decryptAll(curKey, rows) : rows;
    setItems((cur) => [...out, ...cur]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH;
    });
  }

  async function send() {
    const t = text.trim();
    if (!t || !selId || locked) return;
    const key = curKey;
    // 先清空輸入框，可以馬上打下一則（連結要等伺服器抓標題，不能讓它卡住或蓋掉新打的字）
    setText("");
    setSending((n) => n + 1);
    try {
      const saved = await addText(selId, key ? await encryptText(key, t) : t);
      const it = key ? { ...saved, text: t, kind: "text" } : saved;
      stickBottom.current = true;
      setItems((cur) => [...cur, it].sort((a, b) => a.id - b.id));
      loadNotebooks();
    } catch (e) {
      setText((cur) => (cur ? `${t}\n${cur}` : t)); // 失敗就把字放回去，不會不見
      window.alert(`送出失敗：${e?.response?.data?.detail || e.message}`);
    } finally {
      setSending((n) => n - 1);
    }
  }

  async function sendFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length || !selId || locked) return;
    const nbId = selId;
    const cryptoKeyForUpload = curKey;
    for (const f of files) {
      const key = `${Date.now()}-${Math.random()}`;
      const fname = f.name || "image.png";
      setUploads((u) => [...u, { key, name: cryptoKeyForUpload ? `${fname}（加密後上傳）` : fname, pct: 0 }]);
      try {
        const onPct = (pct) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct } : x)));
        let it;
        if (cryptoKeyForUpload) {
          // 在瀏覽器先加密內容和檔名/類型，主機只收到亂碼
          const blob = await encryptBytes(cryptoKeyForUpload, await f.arrayBuffer());
          const encMeta = await encryptText(cryptoKeyForUpload, JSON.stringify({ name: fname, type: f.type || "application/octet-stream", size: f.size }));
          const saved = await uploadFile(nbId, new File([blob], "data.bin", { type: "application/octet-stream" }), "", onPct, encMeta);
          it = await decryptItem(cryptoKeyForUpload, saved);
        } else {
          it = await uploadFile(nbId, f, "", onPct);
        }
        stickBottom.current = true;
        if (nbId === selId) setItems((cur) => [...cur, it]);
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        const msg = e?.response?.data?.detail || (e?.response?.status === 413 ? "檔案太大" : e.message);
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, err: msg } : x)));
      }
    }
    loadNotebooks();
  }

  async function onDelete(item) {
    if (!window.confirm("刪除這則？")) return;
    await deleteItem(item.id);
    setItems((cur) => cur.filter((x) => x.id !== item.id));
    loadNotebooks();
  }
  async function onSaveEdit(item, draft) {
    let it;
    if (curKey) {
      const plain = draft.trim();
      await editItem(item.id, plain ? await encryptText(curKey, plain) : "");
      it = { ...item, text: plain };
    } else {
      it = await editItem(item.id, draft);
    }
    setItems((cur) => cur.map((x) => (x.id === it.id ? it : x)));
    loadNotebooks();
  }

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? notebooks.filter((n) => n.name.toLowerCase().includes(k) || (n.last || "").toLowerCase().includes(k)) : notebooks;
  }, [notebooks, q]);

  return (
    <div className="relative flex h-[calc(100dvh-170px)] min-h-[420px] gap-4 md:h-[calc(100dvh-56px)]">
      {/* ---------- 左：記事本清單 ---------- */}
      <aside className={`${selId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col md:w-80`}>
        <div className="flex items-center justify-between gap-2">
          <h1 onClick={tapTitle} className="cursor-default select-none text-2xl font-black text-slate-900">
            記事本
            {showHidden && <span className="ml-2 align-middle text-xs font-bold text-amber-600">🔓</span>}
          </h1>
          <button onClick={() => setModal({ nb: null })} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-3.5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 active:scale-95">
            ＋ 新增
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋記事本"
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {loadingList && <p className="py-10 text-center text-sm text-slate-400">載入中…</p>}
          {!loadingList && shown.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              {notebooks.length ? "找不到符合的記事本" : "還沒有記事本，點「＋ 新增」開一本"}
            </div>
          )}
          {shown.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelId(n.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                n.id === selId ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-white"
              } ${n.hidden ? "bg-slate-900/[0.04]" : ""}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-slate-100">{n.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate font-bold text-slate-800">{n.name}</span>
                  {n.pinned && <span className="text-xs">📌</span>}
                  {n.hidden && <span className="text-xs">🔒</span>}
                  {n.encrypted && <span className="text-xs" title="加密記事本">🔐</span>}
                  <span className="ml-auto shrink-0 text-[11px] text-slate-400">{n.count ? listTime(n.updated_at) : ""}</span>
                </span>
                <span className="block truncate text-xs text-slate-400">{n.last || "（還沒有內容）"}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ---------- 右：聊天式內容 ---------- */}
      <section
        className={`${selId ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#e8eef5] shadow-sm`}
        onDragOver={(e) => {
          if (!selId || locked) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          sendFiles(e.dataTransfer.files);
        }}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">選一本記事本，或新增一本開始記</div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur">
              <button onClick={() => setSelId(null)} className="rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-slate-100 md:hidden">‹</button>
              <span className="text-xl">{selected.emoji}</span>
              <span className="min-w-0 flex-1 truncate font-black text-slate-900">
                {selected.name} {selected.hidden && <span className="text-xs">🔒</span>}
                {selected.encrypted && <span className="text-xs">🔐</span>}
              </span>
              {curKey && (
                <button onClick={lockNow} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100" title="鎖上，要重新輸入密碼">
                  🔒 鎖上
                </button>
              )}
              <span className="text-xs text-slate-400">{selected.count} 則</span>
              <button onClick={() => setModal({ nb: selected })} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" title="設定">
                ⋯
              </button>
            </header>

            {locked ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-sm">
                  <p className="text-3xl">🔐</p>
                  <p className="mt-2 font-black text-slate-800">加密記事本</p>
                  <p className="mt-1 text-xs text-slate-400">輸入密碼解鎖。重新整理或按「鎖上」後要再輸入一次。</p>
                  <input
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    value={unlockPw}
                    onChange={(e) => setUnlockPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && unlock()}
                    placeholder="密碼"
                    className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-center text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                  {unlockErr && <p className="mt-2 text-xs font-medium text-red-500">{unlockErr}</p>}
                  <button onClick={unlock} disabled={!unlockPw || unlocking} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                    {unlocking ? "驗證中…" : "解鎖"}
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-5">
              {hasMore && (
                <div className="text-center">
                  <button onClick={loadOlder} className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm hover:bg-white">
                    載入更早的內容
                  </button>
                </div>
              )}
              {loadingItems && <p className="py-10 text-center text-sm text-slate-400">載入中…</p>}
              {!loadingItems && items.length === 0 && (
                <p className="py-16 text-center text-sm text-slate-400">
                  {curKey ? "🔐 這本的內容會先在你的裝置加密才送出。" : "在下面輸入文字、貼上網址，或丟照片 / 影片進來。"}
                </p>
              )}
              {items.map((it, i) => (
                <Fragment key={it.id}>
                  {(i === 0 || dayKey(it.created_at) !== dayKey(items[i - 1].created_at)) && (
                    <div className="py-1 text-center">
                      <span className="rounded-full bg-slate-500/20 px-3 py-0.5 text-[11px] font-medium text-slate-600">{dayLabel(it.created_at)}</span>
                    </div>
                  )}
                  <Bubble item={it} cryptoKey={curKey} onDelete={onDelete} onSaveEdit={onSaveEdit} />
                </Fragment>
              ))}
              {uploads.map((u) => (
                <div key={u.key} className="flex justify-end">
                  <div className={`w-56 rounded-2xl px-3.5 py-2 text-xs shadow-sm ${u.err ? "bg-red-50 text-red-600" : "bg-white text-slate-600"}`}>
                    <p className="truncate">{u.err ? `✕ ${u.name}：${u.err}` : `上傳中 ${u.pct}%：${u.name}`}</p>
                    {!u.err && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${u.pct}%` }} />
                      </div>
                    )}
                    {u.err && (
                      <button onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} className="mt-1 underline">
                        關閉
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 輸入列 */}
            <div className="flex items-end gap-2 border-t border-slate-200 bg-white px-2.5 py-2">
              <button onClick={() => fileRef.current?.click()} title="照片 / 影片 / 檔案" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100">
                ＋
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { sendFiles(e.target.files); e.target.value = ""; }} />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter 送出、Shift+Enter 換行；中文選字中（isComposing）不送出
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={(e) => {
                  const files = [...(e.clipboardData?.files || [])];
                  if (files.length) {
                    e.preventDefault();
                    sendFiles(files);
                  }
                }}
                rows={Math.min(5, Math.max(1, text.split("\n").length))}
                placeholder="輸入文字、貼網址或圖片…"
                title="Enter 送出、Shift+Enter 換行；可直接貼上圖片，或把檔案拖進來"
                className="max-h-36 min-h-[40px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              <button onClick={send} disabled={!text.trim()} className="h-10 shrink-0 rounded-full bg-emerald-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95 disabled:opacity-40">
                {sending > 0 ? "送出…" : "送出"}
              </button>
            </div>
            </>
            )}

            {dragOver && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-4 border-dashed border-emerald-400 bg-emerald-50/80 text-lg font-bold text-emerald-700">
                放開就上傳到「{selected.name}」
              </div>
            )}
          </>
        )}
      </section>

      {modal && (
        <NotebookModal
          initial={modal.nb}
          showHidden={showHidden}
          onClose={() => setModal(null)}
          onSaved={(nb, key) => {
            setModal(null);
            if (key) {
              setKeys((k) => ({ ...k, [nb.id]: key })); // 剛建立／剛加密的記事本直接解鎖
              if (selId === nb.id) setItems([]);
            }
            loadNotebooks().then((rows) => {
              if (!modal.nb) setSelId(nb.id);
              // 設成隱藏後、又不在隱藏模式 → 從畫面消失
              if (rows && !rows.some((n) => n.id === nb.id) && selId === nb.id) setSelId(null);
            });
          }}
          onDeleted={(id) => {
            setModal(null);
            if (selId === id) setSelId(null);
            loadNotebooks();
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xl">{toast}</div>
      )}
    </div>
  );
}
