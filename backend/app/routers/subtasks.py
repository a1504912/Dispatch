from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Event, Subtask
from app.schemas import SubtaskCreate, SubtaskUpdate

router = APIRouter(prefix="/api/subtasks", tags=["subtasks"])


@router.get("")
def list_subtasks(
    event_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    query = select(Subtask).order_by(Subtask.created_at)
    if event_id is not None:
        query = query.where(Subtask.event_id == event_id)
    rows = session.exec(query).all()
    # 只有針對「單一行程」查詢（編輯視窗）才回傳明細照片；
    # 總覽拉全部明細時不帶照片，避免資料量過大拖慢讀取。
    include_images = event_id is not None
    result = []
    for s in rows:
        data = s.model_dump()
        if not include_images:
            data["images"] = None
        result.append(data)
    return result


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
    # 只更新有帶進來的欄位（due_date 可明確設為 null 清除）
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(subtask, key, value)
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
