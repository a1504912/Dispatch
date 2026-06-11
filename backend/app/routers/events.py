from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Event
from app.schemas import EventCreate

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[Event])
def list_events(session: Session = Depends(get_session)):
    return session.exec(select(Event)).all()


@router.post("", response_model=Event, status_code=201)
def create_event(payload: EventCreate, session: Session = Depends(get_session)):
    event = Event.model_validate(payload)
    session.add(event)
    session.commit()
    session.refresh(event)
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
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    session.delete(event)
    session.commit()
