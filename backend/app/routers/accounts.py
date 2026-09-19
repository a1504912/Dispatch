from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Account
from app.schemas import AccountCreate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[Account])
def list_accounts(session: Session = Depends(get_session)):
    return session.exec(select(Account).order_by(Account.sort, Account.id)).all()


@router.post("", response_model=Account, status_code=201)
def create_account(payload: AccountCreate, session: Session = Depends(get_session)):
    acc = Account.model_validate(payload)
    session.add(acc)
    session.commit()
    session.refresh(acc)
    return acc


@router.put("/{account_id}", response_model=Account)
def update_account(account_id: int, payload: AccountCreate, session: Session = Depends(get_session)):
    acc = session.get(Account, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    for key, value in payload.model_dump().items():
        setattr(acc, key, value)
    session.add(acc)
    session.commit()
    session.refresh(acc)
    return acc


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, session: Session = Depends(get_session)):
    acc = session.get(Account, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    # 刪主分類（類型）時，一併刪掉底下的子帳戶
    for child in session.exec(select(Account).where(Account.parent_id == account_id)).all():
        session.delete(child)
    session.delete(acc)
    session.commit()
