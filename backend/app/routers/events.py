import base64
import binascii
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app import google_calendar as gcal
from app import thumbs
from app.database import get_session
from app.models import Event, Subtask
from app.schemas import EventCompletedUpdate, EventCreate

router = APIRouter(prefix="/api/events", tags=["events"])


def _propagate_push(session: Session, event: Event) -> None:
    """把本地新增/修改推到 Google（盡力而為，失敗不影響本地操作）。"""
    if event.is_task:
        return  # 待辦事項不進 Google 日曆
    try:
        if gcal.connected(session):
            gcal.push_event(session, event)
    except Exception as exc:  # noqa: BLE001
        print("Google push failed:", exc)


def _propagate_delete(session: Session, google_event_id: Optional[str]) -> None:
    if not google_event_id:
        return
    try:
        if gcal.connected(session):
            gcal.delete_event(session, google_event_id)
    except Exception as exc:  # noqa: BLE001
        print("Google delete failed:", exc)


# 列表不需要的大欄位（原圖、檔案 base64、縮圖）：不從資料庫讀出來，省下大部分時間
_HEAVY = {"image", "images", "files", "thumb"}


def _light_columns():
    return [c for c in Event.__table__.columns if c.name not in _HEAVY]


@router.get("")
def list_events(session: Session = Depends(get_session)):
    """總覽列表：不讀原圖／檔案（圖片數、檔案數存檔時就算好了）；縮圖改成網址（瀏覽器會快取，捲到才載）。"""
    cols = _light_columns()
    rows = session.exec(select(*cols)).all()
    result = []
    for r in rows:
        data = dict(r._mapping)
        data["image_count"] = data.get("image_count") or 0
        data["file_count"] = data.get("file_count") or 0
        tv = data.pop("thumb_v", None)
        if tv:
            data["thumb_url"] = f"/api/events/{data['id']}/thumb?v={tv}"
        result.append(data)
    # 自己轉 JSON（日期轉字串），跳過 FastAPI 逐欄位檢查，筆數多時快很多
    return Response(json.dumps(result, default=_iso, ensure_ascii=False), media_type="application/json")


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


@router.get("/brief")
def list_events_brief(session: Session = Depends(get_session)):
    """選單用（記帳的「所屬行程」、AI 排程的「加到既有行程」）：只要標題和時間。"""
    rows = session.exec(
        select(Event.id, Event.title, Event.start_time, Event.end_time, Event.all_day, Event.is_task, Event.completed)
    ).all()
    return [dict(r._mapping) for r in rows]


@router.get("/{event_id}/thumb")
def event_thumb(event_id: int, session: Session = Depends(get_session)):
    """縮圖（data URL 轉成圖片）。網址帶 ?v=，內容變了網址就會變，所以可以放心長時間快取。"""
    thumb = session.exec(select(Event.thumb).where(Event.id == event_id)).first()
    if not thumb or not str(thumb).startswith("data:"):
        raise HTTPException(status_code=404, detail="沒有縮圖")
    head, _, b64 = str(thumb).partition(",")
    mime = head[5:].split(";")[0] or "image/jpeg"
    try:
        raw = base64.b64decode(b64)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=404, detail="縮圖壞了")
    return Response(raw, media_type=mime, headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: int, session: Session = Depends(get_session)):
    """單一行程完整資料（含原圖），給編輯視窗點開時載入。"""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("", response_model=Event, status_code=201)
def create_event(payload: EventCreate, session: Session = Depends(get_session)):
    event = Event.model_validate(payload.model_dump(exclude={"subtasks"}))
    event.thumb = thumbs.thumb_for(event.image, event.images)
    session.add(event)
    session.flush()  # 先拿到 event.id，明細跟行程同一筆交易一起寫入
    _add_subtasks(session, event.id, payload.subtasks)
    session.commit()
    session.refresh(event)
    _propagate_push(session, event)
    return event


def _add_subtasks(session: Session, event_id: int, titles: list[str] | None) -> None:
    for t in titles or []:
        t = (t or "").strip()
        if t:
            session.add(Subtask(event_id=event_id, title=t))


@router.put("/{event_id}", response_model=Event)
def update_event(
    event_id: int,
    payload: EventCreate,
    session: Session = Depends(get_session),
):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    # 只更新請求有帶的欄位：前端用列表資料（沒有原圖/檔案）改日期時，不會把圖片、檔案清掉
    for key, value in payload.model_dump(exclude={"subtasks"}, exclude_unset=True).items():
        setattr(event, key, value)
    event.thumb = thumbs.thumb_for(event.image, event.images)
    session.add(event)
    _add_subtasks(session, event.id, payload.subtasks)
    session.commit()
    session.refresh(event)
    _propagate_push(session, event)
    return event


@router.patch("/{event_id}/completed", response_model=Event)
def set_completed(
    event_id: int,
    payload: EventCompletedUpdate,
    session: Session = Depends(get_session),
):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.completed = payload.completed
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    google_event_id = event.google_event_id
    for subtask in session.exec(select(Subtask).where(Subtask.event_id == event_id)).all():
        session.delete(subtask)
    session.delete(event)
    session.commit()
    _propagate_delete(session, google_event_id)
