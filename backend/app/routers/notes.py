"""記事本：多個專案（像 LINE 自己傳給自己），可存文字、照片、影片、檔案、連結。

- 照片 / 影片 / 檔案存在 backend/data/notes/（硬碟），資料庫只記檔名，不塞 base64。
- 媒體用 /api/notes/media/{id} 取得；<img>/<video> 帶不了 Authorization header，
  前端會在網址加 ?token=（登入中介層本來就支援）。
- 隱藏專案只是「平常不列出」（要連點標題 5 下才看得到），不是加密。
"""

import json
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Event, Notebook, NoteItem

router = APIRouter(prefix="/api/notes", tags=["notes"])

MEDIA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "notes"
MAX_UPLOAD = 200 * 1024 * 1024  # 單檔上限 200MB（走 Cloudflare 臨時網址時上限約 100MB）
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)


def _media_dir() -> Path:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    return MEDIA_DIR


# ---------- 序列化 ----------


def _item_dict(it: NoteItem) -> dict:
    meta = None
    if it.meta:
        try:
            meta = json.loads(it.meta)
        except ValueError:
            meta = None
    return {
        "id": it.id,
        "notebook_id": it.notebook_id,
        "kind": it.kind,
        "text": it.text,
        "media_url": f"/api/notes/media/{it.id}" if it.media_path else None,
        "media_name": it.media_name,
        "media_type": it.media_type,
        "media_size": it.media_size,
        "meta": meta,
        "created_at": it.created_at.isoformat() + "Z",
    }


def _preview_text(it: NoteItem | None, encrypted: bool = False) -> str:
    if not it:
        return ""
    if encrypted:
        return "🔐 已加密的內容"
    if it.kind == "image":
        return "📷 照片" + (f"：{it.text}" if it.text else "")
    if it.kind == "video":
        return "🎬 影片" + (f"：{it.text}" if it.text else "")
    if it.kind == "file":
        return f"📎 {it.media_name}"
    return it.text.replace("\n", " ")[:60]


def _nb_dict(nb: Notebook, session: Session) -> dict:
    last = session.exec(
        select(NoteItem).where(NoteItem.notebook_id == nb.id).order_by(NoteItem.id.desc()).limit(1)
    ).first()
    count = len(session.exec(select(NoteItem.id).where(NoteItem.notebook_id == nb.id)).all())
    return {
        "id": nb.id,
        "name": nb.name,
        "emoji": nb.emoji,
        "hidden": nb.hidden,
        "pinned": nb.pinned,
        "category": nb.category,
        "updated_at": nb.updated_at.isoformat() + "Z",
        "count": count,
        "last": _preview_text(last, nb.encrypted),
        "encrypted": nb.encrypted,
        "enc_salt": nb.enc_salt,
        "enc_check": nb.enc_check,
    }


def _touch(session: Session, nb: Notebook) -> None:
    nb.updated_at = datetime.utcnow()
    session.add(nb)


def _get_nb(session: Session, nb_id: int) -> Notebook:
    nb = session.get(Notebook, nb_id)
    if not nb:
        raise HTTPException(status_code=404, detail="找不到這個記事本")
    return nb


# ---------- 專案（記事本） ----------


class NotebookIn(BaseModel):
    name: str
    emoji: str = "📒"
    hidden: bool = False
    pinned: bool = False
    category: str = ""
    # 只在建立時有效；之後不能改（改了舊內容就解不開）
    encrypted: bool = False
    enc_salt: str = ""
    enc_check: str = ""


@router.get("/notebooks")
def list_notebooks(include_hidden: int = 0, session: Session = Depends(get_session)):
    rows = session.exec(select(Notebook)).all()
    if not include_hidden:
        rows = [r for r in rows if not r.hidden]
    rows.sort(key=lambda n: (not n.pinned, -(n.updated_at.timestamp())))
    return [_nb_dict(n, session) for n in rows]


@router.post("/notebooks", status_code=201)
def create_notebook(payload: NotebookIn, session: Session = Depends(get_session)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="請輸入名稱")
    if payload.encrypted and not (payload.enc_salt and payload.enc_check):
        raise HTTPException(status_code=400, detail="加密記事本缺少密碼資料")
    nb = Notebook(
        name=payload.name.strip(),
        emoji=payload.emoji or "📒",
        hidden=payload.hidden,
        pinned=payload.pinned,
        category=payload.category.strip()[:40],
        encrypted=payload.encrypted,
        enc_salt=payload.enc_salt if payload.encrypted else "",
        enc_check=payload.enc_check if payload.encrypted else "",
    )
    session.add(nb)
    session.commit()
    session.refresh(nb)
    return _nb_dict(nb, session)


@router.put("/notebooks/{nb_id}")
def update_notebook(nb_id: int, payload: NotebookIn, session: Session = Depends(get_session)):
    nb = _get_nb(session, nb_id)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="請輸入名稱")
    nb.name = payload.name.strip()
    nb.emoji = payload.emoji or "📒"
    nb.hidden = payload.hidden
    nb.pinned = payload.pinned
    nb.category = payload.category.strip()[:40]
    session.add(nb)
    session.commit()
    session.refresh(nb)
    return _nb_dict(nb, session)


@router.delete("/notebooks/{nb_id}", status_code=204)
def delete_notebook(nb_id: int, session: Session = Depends(get_session)):
    nb = session.get(Notebook, nb_id)
    if not nb:
        return
    for it in session.exec(select(NoteItem).where(NoteItem.notebook_id == nb_id)).all():
        _remove_file(it)
        session.delete(it)
    for ev in session.exec(select(Event).where(Event.notebook_id == nb_id)).all():
        ev.notebook_id = None  # 連到這本的行程解除連結
        session.add(ev)
    session.delete(nb)
    session.commit()


@router.get("/notebooks/{nb_id}/events")
def notebook_events(nb_id: int, session: Session = Depends(get_session)):
    """連到這本記事本的行程（記事本那邊顯示「相關行程」用）。"""
    _get_nb(session, nb_id)
    rows = session.exec(select(Event).where(Event.notebook_id == nb_id)).all()
    rows.sort(key=lambda e: e.start_time)
    return [
        {"id": e.id, "title": e.title, "start_time": e.start_time.isoformat(), "all_day": e.all_day, "completed": e.completed, "color": e.color}
        for e in rows
    ]


# ---------- 內容（一則一則） ----------


@router.get("/notebooks/{nb_id}/items")
def list_items(nb_id: int, before: int | None = None, limit: int = 60, session: Session = Depends(get_session)):
    """新的在後；用 before=<最舊那則的 id> 往前載更多。"""
    _get_nb(session, nb_id)
    q = select(NoteItem).where(NoteItem.notebook_id == nb_id)
    if before:
        q = q.where(NoteItem.id < before)
    rows = session.exec(q.order_by(NoteItem.id.desc()).limit(max(1, min(limit, 200)))).all()
    rows.reverse()
    return [_item_dict(r) for r in rows]


class TextIn(BaseModel):
    text: str


@router.post("/notebooks/{nb_id}/items", status_code=201)
def add_text(nb_id: int, payload: TextIn, session: Session = Depends(get_session)):
    nb = _get_nb(session, nb_id)
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="內容是空的")
    it = NoteItem(notebook_id=nb_id, kind="text", text=text)
    m = None if nb.encrypted else URL_RE.search(text)  # 加密內容是亂碼，不抓預覽
    if m:  # 有網址 → 當連結，順便抓標題/預覽圖
        it.kind = "link"
        it.meta = json.dumps(_link_preview(m.group(0)), ensure_ascii=False)
    session.add(it)
    _touch(session, nb)
    session.commit()
    session.refresh(it)
    return _item_dict(it)


@router.post("/notebooks/{nb_id}/upload", status_code=201)
def upload(
    nb_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    enc_meta: str = Form(""),  # 加密記事本：加密過的 {name,type,size}
    session: Session = Depends(get_session),
):
    nb = _get_nb(session, nb_id)
    ctype = (file.content_type or "application/octet-stream").lower()
    kind = "image" if ctype.startswith("image/") else "video" if ctype.startswith("video/") else "file"
    suffix = Path(file.filename or "").suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix or ""):
        suffix = ""
    if nb.encrypted:
        # 主機看不到內容，也不知道是照片還是影片；檔名、類型都在 enc_meta 裡（加密）
        if not enc_meta:
            raise HTTPException(status_code=400, detail="加密記事本的檔案缺少加密資訊")
        kind, ctype, suffix = "enc", "application/octet-stream", ".bin"
    name = f"{uuid.uuid4().hex}{suffix}"
    dest = _media_dir() / name
    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="檔案太大（單檔上限 200MB）")
            out.write(chunk)
    it = NoteItem(
        notebook_id=nb_id,
        kind=kind,
        text=caption.strip(),
        media_path=name,
        media_name="encrypted.bin" if nb.encrypted else (file.filename or name)[:200],
        media_type=ctype,
        media_size=size,
        meta=json.dumps({"enc": enc_meta}) if nb.encrypted else None,
    )
    session.add(it)
    _touch(session, nb)
    session.commit()
    session.refresh(it)
    return _item_dict(it)


@router.put("/items/{item_id}")
def edit_item(item_id: int, payload: TextIn, session: Session = Depends(get_session)):
    it = session.get(NoteItem, item_id)
    if not it:
        raise HTTPException(status_code=404, detail="找不到這則")
    it.text = payload.text.strip()
    nb = session.get(Notebook, it.notebook_id)
    if nb and nb.encrypted:
        pass  # 加密內容：原樣存，不判斷網址
    elif it.kind in ("text", "link"):
        m = URL_RE.search(it.text)
        if m:
            old = json.loads(it.meta) if it.meta else {}
            if old.get("url") != m.group(0):
                it.meta = json.dumps(_link_preview(m.group(0)), ensure_ascii=False)
            it.kind = "link"
        else:
            it.kind, it.meta = "text", None
    session.add(it)
    session.commit()
    session.refresh(it)
    return _item_dict(it)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, session: Session = Depends(get_session)):
    it = session.get(NoteItem, item_id)
    if it:
        _remove_file(it)
        session.delete(it)
        session.commit()


@router.get("/media/{item_id}")
def media(item_id: int, download: int = 0, session: Session = Depends(get_session)):
    it = session.get(NoteItem, item_id)
    if not it or not it.media_path:
        raise HTTPException(status_code=404, detail="找不到檔案")
    path = _media_dir() / it.media_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="檔案已不存在")
    # 照片/影片直接顯示（支援影片拖拉進度）；一般檔案或 download=1 才當下載
    if it.kind == "file" or download:
        return FileResponse(path, media_type=it.media_type, filename=it.media_name)
    return FileResponse(path, media_type=it.media_type)


# ---------- 既有記事本改成加密 ----------
# 兩段式，中途失敗原本內容完全不動：
#   1) 瀏覽器把每個檔案加密後，用 encrypt/blob 先上傳成暫存檔（staged-xxx.bin），資料庫不變
#   2) 全部好了再呼叫 encrypt/commit：同一筆交易把每則換成密文、記事本標成加密，成功後才刪明文檔

STAGED_RE = re.compile(r"^staged-[0-9a-f]{32}\.bin$")


def _cleanup_stale_staged(max_age_s: int = 24 * 3600) -> None:
    import time

    now = time.time()
    for p in _media_dir().glob("staged-*.bin"):
        try:
            if now - p.stat().st_mtime > max_age_s:
                p.unlink(missing_ok=True)
        except OSError:
            pass


@router.post("/notebooks/{nb_id}/encrypt/blob", status_code=201)
def encrypt_stage_blob(nb_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    nb = _get_nb(session, nb_id)
    if nb.encrypted:
        raise HTTPException(status_code=400, detail="這本已經是加密記事本")
    _cleanup_stale_staged()
    name = f"staged-{uuid.uuid4().hex}.bin"
    dest = _media_dir() / name
    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD + 64:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="檔案太大（單檔上限 200MB）")
            out.write(chunk)
    return {"blob": name, "size": size}


class EncItemIn(BaseModel):
    id: int
    text: str = ""  # 加密後的文字（沒有文字就空字串）
    blob: str = ""  # encrypt/blob 回傳的暫存檔名（有檔案的才有）
    enc_meta: str = ""  # 加密後的 {name,type,size}


class EncryptCommitIn(BaseModel):
    enc_salt: str
    enc_check: str
    items: list[EncItemIn]


@router.post("/notebooks/{nb_id}/encrypt/commit")
def encrypt_commit(nb_id: int, payload: EncryptCommitIn, session: Session = Depends(get_session)):
    staged = [i.blob for i in payload.items if i.blob]

    def fail(status: int, msg: str):
        for b in staged:  # 失敗就把這次的暫存檔清掉，原本內容不動
            if STAGED_RE.match(b):
                (_media_dir() / b).unlink(missing_ok=True)
        raise HTTPException(status_code=status, detail=msg)

    nb = session.get(Notebook, nb_id)
    if not nb:
        fail(404, "找不到這個記事本")
    if nb.encrypted:
        fail(400, "這本已經是加密記事本")
    if not (payload.enc_salt and payload.enc_check):
        fail(400, "缺少密碼資料")
    for b in staged:
        if not STAGED_RE.match(b) or not (_media_dir() / b).is_file():
            fail(400, "暫存檔不存在，請重新加密一次")

    rows = session.exec(select(NoteItem).where(NoteItem.notebook_id == nb_id)).all()
    by_id = {r.id: r for r in rows}
    got = {i.id for i in payload.items}
    if got != set(by_id):
        fail(409, "加密期間這本有新增或刪除內容，請再試一次")
    for i in payload.items:
        r = by_id[i.id]
        if r.text and not i.text.startswith("e1:"):
            fail(400, "有內容沒有加密，請再試一次")
        if r.media_path and not (i.blob and i.enc_meta):
            fail(400, "有檔案沒有加密，請再試一次")

    old_files: list[str] = []
    renamed: list[str] = []
    try:
        for i in payload.items:
            r = by_id[i.id]
            r.text = i.text if r.text else ""
            if r.media_path:
                final = i.blob.removeprefix("staged-")
                (_media_dir() / i.blob).rename(_media_dir() / final)
                renamed.append(final)
                old_files.append(r.media_path)
                r.media_path = final
                r.kind = "enc"
                r.media_name = "encrypted.bin"
                r.media_type = "application/octet-stream"
                r.media_size = (_media_dir() / final).stat().st_size
                r.meta = json.dumps({"enc": i.enc_meta})
            else:
                r.kind, r.meta = "text", None  # 連結預覽（標題、網址）是明文，一併拿掉
            session.add(r)
        nb.encrypted = True
        nb.enc_salt = payload.enc_salt
        nb.enc_check = payload.enc_check
        session.add(nb)
        session.commit()
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        for f in renamed:  # 已改名的密文檔也清掉；資料庫仍指向原本的明文檔
            (_media_dir() / f).unlink(missing_ok=True)
        fail(424, f"加密失敗，原本內容沒有變動：{exc}")

    for f in old_files:  # 交易成功後才刪明文檔
        try:
            (_media_dir() / f).unlink(missing_ok=True)
        except OSError:
            pass
    session.refresh(nb)
    return _nb_dict(nb, session)


def _remove_file(it: NoteItem) -> None:
    if it.media_path:
        try:
            (_media_dir() / it.media_path).unlink(missing_ok=True)
        except OSError:
            pass


# ---------- 連結預覽 ----------

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def _meta_tag(html: str, *names: str) -> str:
    for n in names:
        m = re.search(
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(n)}["\'][^>]*content=["\']([^"\']*)["\']', html, re.I
        ) or re.search(
            rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']{re.escape(n)}["\']', html, re.I
        )
        if m and m.group(1).strip():
            return _unescape(m.group(1).strip())
    return ""


def _unescape(s: str) -> str:
    import html as _html

    return _html.unescape(s)


def _link_preview(url: str) -> dict:
    """抓網頁標題、描述、預覽圖（失敗就只回網址，不影響存檔）。"""
    out = {"url": url, "title": "", "description": "", "image": ""}
    try:
        with httpx.Client(timeout=6.0, follow_redirects=True, headers={"User-Agent": _UA}) as client:
            with client.stream("GET", url) as r:
                if r.status_code >= 400 or "html" not in (r.headers.get("content-type") or ""):
                    return out
                buf = b""
                for chunk in r.iter_bytes():
                    buf += chunk
                    if len(buf) > 400_000:
                        break
        html = buf.decode("utf-8", errors="replace")
        out["title"] = _meta_tag(html, "og:title", "twitter:title")
        if not out["title"]:
            m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
            out["title"] = _unescape(m.group(1).strip()) if m else ""
        out["description"] = _meta_tag(html, "og:description", "description", "twitter:description")[:200]
        img = _meta_tag(html, "og:image", "twitter:image")
        if img.startswith("//"):
            img = "https:" + img
        elif img.startswith("/"):
            img = str(httpx.URL(url).join(img))
        out["image"] = img
        out["title"] = out["title"][:150]
    except Exception:  # noqa: BLE001
        pass
    return out
