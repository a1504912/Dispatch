from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
import json

from app.models import LedgerMember, Settlement, SplitBill, Transaction
from app.schemas import SettlementCreate

router = APIRouter(prefix="/api/settlements", tags=["settlements"])


def _offset_allocations(session: Session, member_id: int, amount: float, exclude_id: int | None = None) -> list[dict]:
    """沖銷支出要扣回哪幾筆原支出：把這位成員欠你的分帳照日期排（舊的先），
    扣掉之前已經收過的還款後，這次的金額依序分給還沒還清的那幾筆，
    每一筆沿用原記錄的分類／次分類（例：餐飲・晚餐）。超出的部分記「分帳沖銷」。"""
    who = str(member_id)
    owed = []  # [(bill, 他欠的金額)]
    bills = session.exec(select(SplitBill).where(SplitBill.payer == "self").order_by(SplitBill.date, SplitBill.id)).all()
    for b in bills:
        try:
            shares = json.loads(b.shares or "[]")
        except ValueError:
            continue
        v = sum(float(x.get("value") or 0) for x in shares if isinstance(x, dict) and str(x.get("who")) == who)
        if v > 0.004:
            owed.append((b, v))
    # 之前已經收過的還款，先抵掉最舊的分帳
    q = select(Settlement).where(Settlement.member_id == member_id, Settlement.direction == "in")
    paid = sum(x.amount for x in session.exec(q).all() if x.id != exclude_id)
    left = amount
    out: list[dict] = []
    for b, v in owed:
        if paid >= v - 0.004:
            paid -= v
            continue
        remain, paid = v - paid, 0
        take = min(remain, left)
        if take <= 0.004:
            break
        tx = session.exec(select(Transaction).where(Transaction.split_bill_id == b.id)).first()
        cat = (tx.category if tx else "") or b.category or "分帳沖銷"
        sub = (tx.subcategory if tx else "") or ""
        out.append({"category": cat, "subcategory": sub, "amount": round(take, 2), "title": b.title, "date": b.date.isoformat()})
        left -= take
    if left > 0.004:
        out.append({"category": "分帳沖銷", "subcategory": "", "amount": round(left, 2), "title": "", "date": ""})
    # 同一個分類／次分類合併成一筆
    merged: dict[tuple, dict] = {}
    for a in out:
        k = (a["category"], a["subcategory"])
        if k in merged:
            merged[k]["amount"] = round(merged[k]["amount"] + a["amount"], 2)
            merged[k]["titles"].append(a["title"])
        else:
            merged[k] = {**a, "titles": [a["title"]]}
    return list(merged.values())


@router.get("/offset-preview")
def offset_preview(member_id: int, amount: float, session: Session = Depends(get_session)):
    """收款選「沖銷支出」時，先讓使用者看到會扣回哪個分類。"""
    return _offset_allocations(session, member_id, amount)


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
            # 沖銷原支出：記成負支出，分類沿用當初那筆（例：餐飲・晚餐），讓那個分類的金額往下扣；
            # 橫跨不同分類的分帳會拆成幾筆，第一筆的 id 記在結算上（刪除結算時全部一起刪）
            allocs = _offset_allocations(session, payload.member_id, payload.amount)
            txs = []
            for a in allocs:
                t = Transaction(kind="expense", amount=-a["amount"], category=a["category"],
                                subcategory=a["subcategory"], note=note, date=payload.date,
                                account_id=payload.account_id)
                session.add(t)
                txs.append(t)
            session.commit()
            return [t.id for t in txs]
    else:
        # 你還對方錢（出帳）
        if payload.method in ("expense", "offset"):
            tx = Transaction(kind="expense", amount=payload.amount, category="分帳還款",
                             note=note, date=payload.date, account_id=payload.account_id)
    if tx is None:
        return []
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return [tx.id]


@router.get("", response_model=list[Settlement])
def list_settlements(session: Session = Depends(get_session)):
    return session.exec(select(Settlement).order_by(Settlement.date.desc(), Settlement.id.desc())).all()


@router.post("", response_model=Settlement, status_code=201)
def create_settlement(payload: SettlementCreate, session: Session = Depends(get_session)):
    member = session.get(LedgerMember, payload.member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    tx_ids = _make_ledger_tx(session, payload, member.name)
    s = Settlement.model_validate(payload)
    s.transaction_id = tx_ids[0] if tx_ids else None
    s.extra_tx_ids = json.dumps(tx_ids[1:]) if len(tx_ids) > 1 else None
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


@router.delete("/{settlement_id}", status_code=204)
def delete_settlement(settlement_id: int, session: Session = Depends(get_session)):
    s = session.get(Settlement, settlement_id)
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")
    # 一併刪掉當初建立的記帳條目（沖銷拆成多筆的也一起）
    ids = [s.transaction_id] if s.transaction_id else []
    try:
        ids += json.loads(s.extra_tx_ids or "[]")
    except ValueError:
        pass
    for tid in ids:
        tx = session.get(Transaction, tid)
        if tx:
            session.delete(tx)
    session.delete(s)
    session.commit()
