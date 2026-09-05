from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import LedgerMember, Settlement, Transaction
from app.schemas import SettlementCreate

router = APIRouter(prefix="/api/settlements", tags=["settlements"])


def _make_ledger_tx(session: Session, payload: SettlementCreate, member_name: str):
    """依記帳方式建立對應的記帳條目；回傳 tx.id 或 None。"""
    note = payload.note or f"分帳結算：{member_name}"
    tx = None
    if payload.direction == "in":
        # 對方還你錢（進帳）
        if payload.method == "income":
            tx = Transaction(kind="income", amount=payload.amount, category="分帳還款",
                             note=note, date=payload.date, account_id=payload.account_id)
        elif payload.method == "offset":
            # 沖銷原支出：記成一筆負支出，讓本月支出/分類金額往下扣
            tx = Transaction(kind="expense", amount=-payload.amount, category="分帳沖銷",
                             note=note, date=payload.date, account_id=payload.account_id)
    else:
        # 你還對方錢（出帳）
        if payload.method in ("expense", "offset"):
            tx = Transaction(kind="expense", amount=payload.amount, category="分帳還款",
                             note=note, date=payload.date, account_id=payload.account_id)
    if tx is None:
        return None
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return tx.id


@router.get("", response_model=list[Settlement])
def list_settlements(session: Session = Depends(get_session)):
    return session.exec(select(Settlement).order_by(Settlement.date.desc(), Settlement.id.desc())).all()


@router.post("", response_model=Settlement, status_code=201)
def create_settlement(payload: SettlementCreate, session: Session = Depends(get_session)):
    member = session.get(LedgerMember, payload.member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    tx_id = _make_ledger_tx(session, payload, member.name)
    s = Settlement.model_validate(payload)
    s.transaction_id = tx_id
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


@router.delete("/{settlement_id}", status_code=204)
def delete_settlement(settlement_id: int, session: Session = Depends(get_session)):
    s = session.get(Settlement, settlement_id)
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")
    # 一併刪掉當初建立的記帳條目
    if s.transaction_id:
        tx = session.get(Transaction, s.transaction_id)
        if tx:
            session.delete(tx)
    session.delete(s)
    session.commit()
