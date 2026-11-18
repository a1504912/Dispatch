import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.database import get_session
from app.models import Transaction
from app.schemas import TransactionCreate

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
def list_transactions(session: Session = Depends(get_session)):
    # 全部回傳（依日期新到舊），前端自行依月份篩選，切換月份不用重打 API。
    # 直接讀欄位、自己轉 JSON：幾千筆時比逐筆建模型＋驗證快好幾倍
    cols = list(Transaction.__table__.columns)
    rows = session.exec(select(*cols).order_by(Transaction.date.desc(), Transaction.id.desc())).all()
    data = [dict(r._mapping) for r in rows]
    return Response(json.dumps(data, default=_iso, ensure_ascii=False), media_type="application/json")


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


@router.post("", response_model=Transaction, status_code=201)
def create_transaction(payload: TransactionCreate, session: Session = Depends(get_session)):
    tx = Transaction.model_validate(payload)
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return tx


@router.put("/{tx_id}", response_model=Transaction)
def update_transaction(
    tx_id: int, payload: TransactionCreate, session: Session = Depends(get_session)
):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tx, key, value)
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return tx


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, session: Session = Depends(get_session)):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    session.delete(tx)
    session.commit()
