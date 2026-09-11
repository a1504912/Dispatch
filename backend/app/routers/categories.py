from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Category, Event
from app.schemas import CategoryCreate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[Category])
def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category).order_by(Category.created_at)).all()


@router.post("", response_model=Category, status_code=201)
def create_category(payload: CategoryCreate, session: Session = Depends(get_session)):
    category = Category.model_validate(payload)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.put("/{category_id}", response_model=Category)
def update_category(
    category_id: int,
    payload: CategoryCreate,
    session: Session = Depends(get_session),
):
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.name = payload.name
    category.color = payload.color
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, session: Session = Depends(get_session)):
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    # 使用中的行程改回「未分類」
    for event in session.exec(select(Event).where(Event.category_id == category_id)).all():
        event.category_id = None
        session.add(event)
    session.delete(category)
    session.commit()
