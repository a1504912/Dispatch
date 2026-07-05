from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Event, Subtask
from app.schemas import SubtaskCreate, SubtaskUpdate

router = APIRouter(prefix="/api/subtasks", tags=["subtasks"])


@router.get("", response_model=list[Subtask])
def list_subtasks(
    event_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    query = select(Subtask).order_by(Subtask.created_at)
    if event_id is not None:
        query = query.where(Subtask.event_id == event_id)
    return session.exec(query).all()


@router.post("", response_model=Subtask, status_code=201)
def create_subtask(payload: SubtaskCreate, session: Session = Depends(get_session)):
    if not session.get(Event, payload.event_id):
        raise HTTPException(status_code=404, detail="Event not found")
    subtask = Subtask.model_validate(payload)
    session.add(subtask)
    session.commit()
    session.refresh(subtask)
    return subtask


@router.patch("/{subtask_id}", response_model=Subtask)
def update_subtask(
    subtask_id: int,
    payload: SubtaskUpdate,
    session: Session = Depends(get_session),
):
    subtask = session.get(Subtask, subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    if payload.title is not None:
        subtask.title = payload.title
    if payload.done is not None:
        subtask.done = payload.done
    session.add(subtask)
    session.commit()
    session.refresh(subtask)
    return subtask


@router.delete("/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: int, session: Session = Depends(get_session)):
    subtask = session.get(Subtask, subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    session.delete(subtask)
    session.commit()
