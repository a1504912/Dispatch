from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import LedgerCategory
from app.schemas import LedgerCategoryCreate

router = APIRouter(prefix="/api/ledger-categories", tags=["ledger-categories"])


@router.get("", response_model=list[LedgerCategory])
def list_categories(session: Session = Depends(get_session)):
    return session.exec(
        select(LedgerCategory).order_by(LedgerCategory.kind, LedgerCategory.sort, LedgerCategory.id)
    ).all()


@router.post("", response_model=LedgerCategory, status_code=201)
def create_category(payload: LedgerCategoryCreate, session: Session = Depends(get_session)):
    cat = LedgerCategory.model_validate(payload)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.put("/{cat_id}", response_model=LedgerCategory)
def update_category(
    cat_id: int, payload: LedgerCategoryCreate, session: Session = Depends(get_session)
):
    cat = session.get(LedgerCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.model_dump().items():
        setattr(cat, key, value)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.delete("/{cat_id}", status_code=204)
def delete_category(cat_id: int, session: Session = Depends(get_session)):
    cat = session.get(LedgerCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    session.delete(cat)
    session.commit()
