from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Pillar, Post
from app.schemas import PillarCreate, PillarUpdate

router = APIRouter(prefix="/api/pillars", tags=["pillars"])


def _validate_ratio(value: int | None) -> None:
    if value is not None and not 0 <= value <= 100:
        raise HTTPException(status_code=422, detail="target_ratio must be between 0 and 100")


@router.get("", response_model=list[Pillar])
def list_pillars(session: Session = Depends(get_session)):
    return session.exec(select(Pillar).order_by(Pillar.id)).all()


@router.post("", response_model=Pillar, status_code=201)
def create_pillar(payload: PillarCreate, session: Session = Depends(get_session)):
    _validate_ratio(payload.target_ratio)
    pillar = Pillar.model_validate(payload)
    session.add(pillar)
    session.commit()
    session.refresh(pillar)
    return pillar


@router.patch("/{pillar_id}", response_model=Pillar)
def update_pillar(
    pillar_id: int,
    payload: PillarUpdate,
    session: Session = Depends(get_session),
):
    pillar = session.get(Pillar, pillar_id)
    if not pillar:
        raise HTTPException(status_code=404, detail="Pillar not found")
    _validate_ratio(payload.target_ratio)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(pillar, key, value)
    session.add(pillar)
    session.commit()
    session.refresh(pillar)
    return pillar


@router.delete("/{pillar_id}", status_code=204)
def delete_pillar(pillar_id: int, session: Session = Depends(get_session)):
    pillar = session.get(Pillar, pillar_id)
    if not pillar:
        raise HTTPException(status_code=404, detail="Pillar not found")
    # Keep the posts; they just become unassigned.
    for post in session.exec(select(Post).where(Post.pillar_id == pillar_id)).all():
        post.pillar_id = None
        session.add(post)
    session.delete(pillar)
    session.commit()
