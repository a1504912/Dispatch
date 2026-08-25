from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import LedgerMember
from app.schemas import LedgerMemberCreate

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("", response_model=list[LedgerMember])
def list_members(session: Session = Depends(get_session)):
    return session.exec(select(LedgerMember).order_by(LedgerMember.id)).all()


@router.post("", response_model=LedgerMember, status_code=201)
def create_member(payload: LedgerMemberCreate, session: Session = Depends(get_session)):
    member = LedgerMember.model_validate(payload)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


@router.put("/{member_id}", response_model=LedgerMember)
def update_member(
    member_id: int, payload: LedgerMemberCreate, session: Session = Depends(get_session)
):
    member = session.get(LedgerMember, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    for key, value in payload.model_dump().items():
        setattr(member, key, value)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


@router.delete("/{member_id}", status_code=204)
def delete_member(member_id: int, session: Session = Depends(get_session)):
    member = session.get(LedgerMember, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    session.delete(member)
    session.commit()
