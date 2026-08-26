from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Budget
from app.schemas import BudgetCreate

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=list[Budget])
def list_budgets(session: Session = Depends(get_session)):
    return session.exec(select(Budget).order_by(Budget.id)).all()


@router.post("", response_model=Budget, status_code=201)
def create_budget(payload: BudgetCreate, session: Session = Depends(get_session)):
    # 同一分類（含總預算）只留一筆：已存在就更新
    existing = session.exec(select(Budget).where(Budget.category == payload.category)).first()
    if existing:
        existing.amount = payload.amount
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    budget = Budget.model_validate(payload)
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return budget


@router.put("/{budget_id}", response_model=Budget)
def update_budget(budget_id: int, payload: BudgetCreate, session: Session = Depends(get_session)):
    budget = session.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    budget.category = payload.category
    budget.amount = payload.amount
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, session: Session = Depends(get_session)):
    budget = session.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    session.delete(budget)
    session.commit()
