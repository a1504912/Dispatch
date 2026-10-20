"""身家財產：保險、汽機車、貴重物品、3C 家電、房產的紀錄＋重要日期提醒。

每一件有：類別專屬欄位（fields）、自訂欄位（extra）、重要日期（dates）、附件（照片／保單／發票）。
重要日期可設「每年／每月…」重複，按「已處理」會推到下一期並留下紀錄；排程會照提前天數推播。
資料、附件都只存在主機（附件在 data/property/），不進 git。
"""

import calendar
import json
import re
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.models import PropertyFile, PropertyItem
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/property", tags=["property"])

FILE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "property"
MAX_FILE = 60 * 1024 * 1024  # 單檔 60MB（Cloudflare 網址每個請求上限 100MB）
KINDS = {"insurance", "car", "motorcycle", "valuable", "electronics", "house", "other"}
STATUSES = {"active", "sold", "cancelled", "scrapped", "ended"}
REPEAT_MONTHS = {"none": 0, "monthly": 1, "quarterly": 3, "halfyear": 6, "yearly": 12, "2years": 24}

K_ENABLED = "property_remind_enabled"
K_TIME = "property_remind_time"
K_DAYS = "property_remind_days"


# ---------- 日期工具 ----------


def today_local() -> date:
    """依設定的時區算「今天」（跟排程、行事曆一致）。"""
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo(settings.timezone)).date()


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def _parse_date(v) -> date | None:
    try:
        return date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def _loads(raw, default):
    try:
        v = json.loads(raw or "")
        return v if isinstance(v, type(default)) else default
    except ValueError:
        return default


def _clean_dates(raw) -> list[dict]:
    out = []
    for d in raw if isinstance(raw, list) else []:
        if not isinstance(d, dict):
            continue
        label = str(d.get("label") or "").strip()[:40]
        if not label:
            continue
        dt = _parse_date(d.get("date"))
        repeat = d.get("repeat") if d.get("repeat") in REPEAT_MONTHS else "none"
        try:
            remind = int(d.get("remind_days", 30))
        except (TypeError, ValueError):
            remind = 30
        history = [h for h in (d.get("history") or []) if isinstance(h, dict)][-20:]
        out.append({
            "id": str(d.get("id") or uuid.uuid4().hex[:10])[:20],
            "label": label,
            "date": dt.isoformat() if dt else "",
            "repeat": repeat,
            "remind_days": max(-1, min(remind, 365)),
            "done": bool(d.get("done")),
            "note": str(d.get("note") or "")[:200],
            "history": history,
        })
    return out


def date_state(entry: dict, today: date) -> dict:
    """算這個日期離今天幾天、狀態（逾期／快到／正常／已完成）。"""
    dt = _parse_date(entry.get("date"))
    if entry.get("done") or not dt:
        return {"days_left": None, "state": "done" if entry.get("done") else "nodate"}
    left = (dt - today).days
    remind = entry.get("remind_days", 30)
    if left < 0:
        state = "overdue"
    elif remind >= 0 and left <= remind:
        state = "soon"
    else:
        state = "ok"
    return {"days_left": left, "state": state}


def _item_out(it: PropertyItem, files: list[PropertyFile], today: date) -> dict:
    dates = []
    for d in _loads(it.dates, []):
        dates.append({**d, **date_state(d, today)})
    images = [f for f in files if (f.mime or "").startswith("image/")]
    return {
        "id": it.id,
        "kind": it.kind,
        "name": it.name,
        "status": it.status,
        "purchase_date": it.purchase_date.isoformat() if it.purchase_date else "",
        "purchase_price": it.purchase_price,
        "current_value": it.current_value,
        "fields": _loads(it.fields, {}),
        "extra": _loads(it.extra, []),
        "dates": dates,
        "note": it.note,
        "files": [
            {"id": f.id, "name": f.name, "mime": f.mime, "size": f.size, "url": f"/api/property/files/{f.id}"}
            for f in files
        ],
        "cover": f"/api/property/files/{images[0].id}" if images else None,
        "created_at": it.created_at.isoformat() + "Z",
        "updated_at": it.updated_at.isoformat() + "Z",
    }


def _files_of(session: Session, item_id: int) -> list[PropertyFile]:
    return session.exec(select(PropertyFile).where(PropertyFile.item_id == item_id).order_by(PropertyFile.id)).all()


def _get(session: Session, item_id: int) -> PropertyItem:
    it = session.get(PropertyItem, item_id)
    if not it:
        raise HTTPException(404, "找不到這一項")
    return it


# ---------- 財產 ----------


class ItemIn(BaseModel):
    kind: str = "other"
    name: str
    status: str = "active"
    purchase_date: str = ""
    purchase_price: float | None = None
    current_value: float | None = None
    fields: dict = {}
    extra: list = []
    dates: list = []
    note: str = ""


def _apply(it: PropertyItem, p: ItemIn) -> None:
    if not p.name.strip():
        raise HTTPException(400, "請輸入名稱")
    if p.kind not in KINDS:
        raise HTTPException(400, "類別不對")
    it.kind = p.kind
    it.name = p.name.strip()[:100]
    it.status = p.status if p.status in STATUSES else "active"
    it.purchase_date = _parse_date(p.purchase_date)
    it.purchase_price = p.purchase_price if p.purchase_price not in ("", None) else None
    it.current_value = p.current_value if p.current_value not in ("", None) else None
    it.fields = json.dumps({str(k)[:40]: str(v)[:2000] for k, v in (p.fields or {}).items() if str(v or "").strip()},
                           ensure_ascii=False)
    extra = [{"label": str(e.get("label", "")).strip()[:40], "value": str(e.get("value", "")).strip()[:2000]}
             for e in (p.extra or []) if isinstance(e, dict) and str(e.get("label", "")).strip()]
    it.extra = json.dumps(extra, ensure_ascii=False)
    it.dates = json.dumps(_clean_dates(p.dates), ensure_ascii=False)
    it.note = (p.note or "")[:5000]
    it.updated_at = datetime.utcnow()


@router.get("/items")
def list_items(session: Session = Depends(get_session)):
    today = today_local()
    items = session.exec(select(PropertyItem).order_by(PropertyItem.id)).all()
    files = session.exec(select(PropertyFile).order_by(PropertyFile.id)).all()
    by: dict[int, list] = {}
    for f in files:
        by.setdefault(f.item_id, []).append(f)
    return [_item_out(it, by.get(it.id, []), today) for it in items]


@router.post("/items", status_code=201)
def create_item(payload: ItemIn, session: Session = Depends(get_session)):
    it = PropertyItem(name=payload.name or "")
    _apply(it, payload)
    session.add(it)
    session.commit()
    session.refresh(it)
    return _item_out(it, [], today_local())


@router.put("/items/{item_id}")
def update_item(item_id: int, payload: ItemIn, session: Session = Depends(get_session)):
    it = _get(session, item_id)
    _apply(it, payload)
    session.add(it)
    session.commit()
    session.refresh(it)
    return _item_out(it, _files_of(session, it.id), today_local())


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, session: Session = Depends(get_session)):
    it = _get(session, item_id)
    for f in _files_of(session, it.id):
        (FILE_DIR / f.path).unlink(missing_ok=True)
        session.delete(f)
    session.delete(it)
    session.commit()


class DoneIn(BaseModel):
    undo: bool = False


@router.post("/items/{item_id}/dates/{date_id}/done")
def mark_done(item_id: int, date_id: str, payload: DoneIn | None = None, session: Session = Depends(get_session)):
    """標記「已處理」：會重複的（繳費、牌照稅…）推到下一期並記一筆紀錄；不重複的標成完成。"""
    it = _get(session, item_id)
    dates = _loads(it.dates, [])
    today = today_local()
    for d in dates:
        if d.get("id") != date_id:
            continue
        if payload and payload.undo:
            d["done"] = False
            break
        dt = _parse_date(d.get("date"))
        months = REPEAT_MONTHS.get(d.get("repeat"), 0)
        hist = d.get("history") or []
        hist.append({"date": d.get("date", ""), "done_at": today.isoformat()})
        d["history"] = hist[-20:]
        if months and dt:
            nxt = add_months(dt, months)
            while nxt <= today:  # 拖很久才處理：直接跳到今天之後的下一期
                nxt = add_months(nxt, months)
            d["date"] = nxt.isoformat()
            d["done"] = False
        else:
            d["done"] = True
        break
    else:
        raise HTTPException(404, "找不到這個日期")
    it.dates = json.dumps(dates, ensure_ascii=False)
    it.updated_at = datetime.utcnow()
    session.add(it)
    session.commit()
    session.refresh(it)
    return _item_out(it, _files_of(session, it.id), today)


# ---------- 附件 ----------


@router.post("/items/{item_id}/files", status_code=201)
def upload_file(item_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    it = _get(session, item_id)
    FILE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix or ""):
        suffix = ""
    name = f"{uuid.uuid4().hex}{suffix}"
    dest = FILE_DIR / name
    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_FILE:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, "檔案太大（單檔上限 60MB）")
            out.write(chunk)
    f = PropertyFile(item_id=it.id, path=name, name=(file.filename or name)[:200],
                     mime=(file.content_type or "application/octet-stream").lower(), size=size)
    session.add(f)
    it.updated_at = datetime.utcnow()
    session.add(it)
    session.commit()
    session.refresh(it)
    return _item_out(it, _files_of(session, it.id), today_local())


@router.get("/files/{file_id}")
def get_file(file_id: int, download: int = 0, session: Session = Depends(get_session)):
    f = session.get(PropertyFile, file_id)
    if not f or not (FILE_DIR / f.path).is_file():
        raise HTTPException(404, "找不到檔案")
    return FileResponse(
        FILE_DIR / f.path,
        media_type=f.mime or "application/octet-stream",
        filename=f.name if download else None,
        content_disposition_type="attachment" if download else "inline",
    )


@router.delete("/files/{file_id}")
def delete_file(file_id: int, session: Session = Depends(get_session)):
    f = session.get(PropertyFile, file_id)
    if not f:
        raise HTTPException(404, "找不到檔案")
    item_id = f.item_id
    (FILE_DIR / f.path).unlink(missing_ok=True)
    session.delete(f)
    session.commit()
    it = _get(session, item_id)
    return _item_out(it, _files_of(session, item_id), today_local())


# ---------- 提醒設定 ----------


def remind_settings(session: Session) -> dict:
    try:
        days = int(get_setting(session, K_DAYS, "30") or 30)
    except ValueError:
        days = 30
    return {
        "enabled": get_setting(session, K_ENABLED, "1") != "0",
        "time": get_setting(session, K_TIME, "09:00") or "09:00",
        "default_days": days,
    }


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    return remind_settings(session)


class SettingsIn(BaseModel):
    enabled: bool = True
    time: str = "09:00"
    default_days: int = 30


@router.put("/settings")
def put_settings(payload: SettingsIn, session: Session = Depends(get_session)):
    if not re.fullmatch(r"\d{2}:\d{2}", payload.time or ""):
        raise HTTPException(400, "時間格式應為 HH:MM")
    set_setting(session, K_ENABLED, "1" if payload.enabled else "0")
    set_setting(session, K_TIME, payload.time)
    set_setting(session, K_DAYS, str(max(0, min(payload.default_days, 365))))
    return remind_settings(session)
