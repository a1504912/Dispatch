import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
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


@router.get("")
def list_events(session: Session = Depends(get_session)):
    # 列表只回小縮圖 thumb，拿掉大張的 image/images，大幅減少總覽讀取量。
    events = session.exec(select(Event)).all()
    result = []
    for e in events:
        data = e.model_dump()
        # 先算出圖片張數（給前端顯示載入骨架用），再把大張圖片拿掉
        count = 0
        if e.images:
            try:
                arr = json.loads(e.images)
                count = len(arr) if isinstance(arr, list) else 0
            except (ValueError, TypeError):
                count = 0
        if count == 0 and e.image:
            count = 1
        data["image_count"] = count
        data.pop("image", None)
        data.pop("images", None)
        result.append(data)
    return result


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: int, session: Session = Depends(get_session)):
    """單一行程完整資料（含原圖），給編輯視窗點開時載入。"""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("", response_model=Event, status_code=201)
def create_event(payload: EventCreate, session: Session = Depends(get_session)):
    event = Event.model_validate(payload)
    event.thumb = thumbs.thumb_for(event.image, event.images)
    session.add(event)
    session.commit()
    session.refresh(event)
    _propagate_push(session, event)
    return event


@router.put("/{event_id}", response_model=Event)
def update_event(
    event_id: int,
    payload: EventCreate,
    session: Session = Depends(get_session),
):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    for key, value in payload.model_dump().items():
        setattr(event, key, value)
    event.thumb = thumbs.thumb_for(event.image, event.images)
    session.add(event)
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
