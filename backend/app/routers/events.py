from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app import google_calendar as gcal
from app.database import get_session
from app.models import Event
from app.schemas import EventCompletedUpdate, EventCreate

router = APIRouter(prefix="/api/events", tags=["events"])


def _propagate_push(session: Session, event: Event) -> None:
    """把本地新增/修改推到 Google（盡力而為，失敗不影響本地操作）。"""
    try:
        if gcal.connected(session):
            gcal.push_event(session, event)
    except Exception as exc:  # noqa: BLE001
        print("Google push failed:", exc)


def _propagate_delete(session: Session, google_event_id: str | None) -> None:
    if not google_event_id:
        return
    try:
        if gcal.connected(session):
            gcal.delete_event(session, google_event_id)
    except Exception as exc:  # noqa: BLE001
        print("Google delete failed:", exc)


@router.get("", response_model=list[Event])
def list_events(session: Session = Depends(get_session)):
    return session.exec(select(Event)).all()


@router.post("", response_model=Event, status_code=201)
def create_event(payload: EventCreate, session: Session = Depends(get_session)):
    event = Event.model_validate(payload)
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
    session.delete(event)
    session.commit()
    _propagate_delete(session, google_event_id)
