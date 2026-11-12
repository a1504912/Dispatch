from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
import json

from app.models import LedgerMember, Settlement, SplitBill, Transaction
from app.schemas import SettlementCreate

router = APIRouter(prefix="/api/settlements", tags=["settlements"])


def _parse_ids(raw) -> list[int]:
    if not raw:
        return []
    if isinstance(raw, (list, tuple)):
        vals = raw
    else:
        try:
            vals = json.loads(raw)
        except ValueError:
            vals = str(raw).split(",")
        if not isinstance(vals, list):
            vals = [vals]
    out = []
    for v in vals if isinstance(vals, list) else []:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return out


def _offset_allocations(session: Session, member_id: int, amount: float, exclude_id: int | None = None,
                        bill_ids=None) -> list[dict]:
    """沖銷支出要扣回哪幾筆原支出：把這位成員欠你的分帳照日期排（舊的先），
    之前的還款先扣掉（有指定分帳的先扣那幾筆，其餘從最舊的開始抵），
    這次的金額有指定分帳就先分給那幾筆，剩的再依序分給還沒還清的；
    每一筆沿用原記錄的分類／次分類（例：餐飲・晚餐）。超出的部分記「分帳沖銷」。"""
    who = str(member_id)
    owed = []  # [bill]
    remain: dict[int, float] = {}
    bills = session.exec(select(SplitBill).where(SplitBill.payer == "self").order_by(SplitBill.date, SplitBill.id)).all()
    for b in bills:
        try:
            shares = json.loads(b.shares or "[]")
        except ValueError:
            continue
        v = sum(float(x.get("value") or 0) for x in shares if isinstance(x, dict) and str(x.get("who")) == who)
        if v > 0.004:
            owed.append(b)
            remain[b.id] = v

    def take_from(ids, money: float) -> tuple[float, list]:
        """依序從指定的分帳扣，回傳 (剩下沒用完的錢, [(bill, 扣多少)])"""
        used = []
        for b in owed:
            if money <= 0.004:
                break
            if ids is not None and b.id not in ids:
                continue
            t = min(remain[b.id], money)
            if t > 0.004:
                remain[b.id] -= t
                money -= t
                used.append((b, t))
        return money, used

    # 之前已經收過的還款：指定的先扣那幾筆，剩的跟沒指定的一起從最舊的抵
    q = select(Settlement).where(Settlement.member_id == member_id, Settlement.direction == "in")
    pool = 0.0
    for x in session.exec(q.order_by(Settlement.date, Settlement.id)).all():
        if x.id == exclude_id:
            continue
        ids = set(_parse_ids(x.bill_ids))
        if ids:
            left_x, _ = take_from(ids, x.amount)
            pool += left_x
        else:
            pool += x.amount
    take_from(None, pool)

    # 這一次
    ids = set(_parse_ids(bill_ids))
    left = amount
    used = []
    if ids:
        left, used = take_from(ids, left)
    left, more = take_from(None, left)
    used += more
    out: list[dict] = []
    for b, t in used:
        tx = session.exec(select(Transaction).where(Transaction.split_bill_id == b.id)).first()
        cat = (tx.category if tx else "") or b.category or "分帳沖銷"
        sub = (tx.subcategory if tx else "") or ""
        out.append({"category": cat, "subcategory": sub, "amount": round(t, 2), "title": b.title, "date": b.date.isoformat()})
    if left > 0.004:
        if out and left < 1:
            # 平均分帳除不盡的零頭（例：929/3＝309.67，對方給 310）：併進最後一筆，不要多出一筆 $0 的「分帳沖銷」
            out[-1]["amount"] = round(out[-1]["amount"] + left, 2)
        else:
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
def offset_preview(member_id: int, amount: float, bill_ids: str = "", session: Session = Depends(get_session)):
    """收款選「沖銷支出」時，先讓使用者看到會扣回哪個分類。"""
    return _offset_allocations(session, member_id, amount, bill_ids=bill_ids)


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
            allocs = _offset_allocations(session, payload.member_id, payload.amount, bill_ids=payload.bill_ids)
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
    ids = _parse_ids(payload.bill_ids)
    payload.bill_ids = json.dumps(ids) if ids else None
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


def merge_tiny_offsets() -> int:
    """一次性整理：以前沖銷時，除不盡的零頭（不到 1 元）會多記一筆「分帳沖銷 $0」。
    把它併回同一次結算的其他沖銷記錄後刪掉。重跑不會有事（沒有零頭就不動）。"""
    from app.database import engine

    fixed = 0
    with Session(engine) as session:
        for st in session.exec(select(Settlement).where(Settlement.method == "offset")).all():
            ids = [st.transaction_id] if st.transaction_id else []
            try:
                ids += [int(i) for i in json.loads(st.extra_tx_ids or "[]")]
            except (ValueError, TypeError):
                continue
            txs = [t for t in (session.get(Transaction, i) for i in ids) if t]
            tiny = [t for t in txs if t.category == "分帳沖銷" and abs(t.amount) < 1]
            keep = [t for t in txs if t not in tiny]
            if not tiny or not keep:
                continue
            target = max(keep, key=lambda t: abs(t.amount))
            for t in tiny:
                target.amount = round(target.amount + t.amount, 2)
                session.delete(t)
                fixed += 1
            session.add(target)
            remaining = [t.id for t in keep]
            st.transaction_id = remaining[0]
            st.extra_tx_ids = json.dumps(remaining[1:]) if len(remaining) > 1 else None
            session.add(st)
        session.commit()
    return fixed
