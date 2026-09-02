"""訂閱（週期性自動記帳）：到扣款日自動建立一筆支出。"""

import calendar
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Subscription, Transaction

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


def _clamp_day(y: int, m: int, day: int) -> int:
    return min(max(1, day), calendar.monthrange(y, m)[1])


def _next_monthly(day: int, today: date) -> date:
    y, m = today.year, today.month
    d = date(y, m, _clamp_day(y, m, day))
    if d < today:
        m += 1
        if m > 12:
            m, y = 1, y + 1
        d = date(y, m, _clamp_day(y, m, day))
    return d


def _next_yearly(month: int, day: int, today: date) -> date:
    y = today.year
    d = date(y, month, _clamp_day(y, month, day))
    if d < today:
        d = date(y + 1, month, _clamp_day(y + 1, month, day))
    return d


def _advance(cur: date, cycle: str, day: int, month: int) -> date:
    if cycle == "yearly":
        y = cur.year + 1
        return date(y, month, _clamp_day(y, month, day))
    y, m = cur.year, cur.month + 1
    if m > 12:
        m, y = 1, y + 1
    return date(y, m, _clamp_day(y, m, day))


def _compute_next(cycle: str, day: int, month: int, today: date | None = None) -> date:
    today = today or date.today()
    if cycle == "yearly":
        return _next_yearly(month, day, today)
    return _next_monthly(day, today)


def charge_due(session: Session, today: date | None = None) -> list[tuple[Subscription, date]]:
    """把所有到期的訂閱記成支出，並把 next_date 往後推。回傳這次記了哪些。"""
    today = today or date.today()
    charged: list[tuple[Subscription, date]] = []
    subs = session.exec(select(Subscription).where(Subscription.active == True)).all()  # noqa: E712
    for s in subs:
        guard = 0
        while s.next_date and s.next_date <= today and guard < 24:
            tx = Transaction(
                kind="expense",
                amount=abs(s.amount),
                category=s.category or "訂閱",
                subcategory=s.subcategory or "",
                note=s.note or f"訂閱：{s.name}",
                date=s.next_date,
                account=s.account or "",
                account_id=s.account_id,
            )
            session.add(tx)
            charged.append((s, s.next_date))
            s.next_date = _advance(s.next_date, s.cycle, s.day, s.month)
            guard += 1
        session.add(s)
    if charged:
        session.commit()
    return charged


def _to_dict(s: Subscription) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "emoji": s.emoji,
        "amount": s.amount,
        "category": s.category,
        "subcategory": s.subcategory,
        "account": s.account,
        "account_id": s.account_id,
        "cycle": s.cycle,
        "day": s.day,
        "month": s.month,
        "next_date": s.next_date.isoformat() if s.next_date else None,
        "active": s.active,
        "note": s.note,
    }


class SubIn(BaseModel):
    name: str
    emoji: str = "🔁"
    amount: float = 0
    category: str = "訂閱"
    subcategory: str = ""
    account: str = ""
    account_id: int | None = None
    cycle: str = "monthly"
    day: int = 1
    month: int = 1
    active: bool = True
    note: str = ""


@router.get("")
def list_subs(session: Session = Depends(get_session)):
    rows = session.exec(select(Subscription).order_by(Subscription.next_date)).all()
    return [_to_dict(s) for s in rows]


@router.post("", status_code=201)
def create_sub(payload: SubIn, session: Session = Depends(get_session)):
    s = Subscription(
        **payload.model_dump(),
        next_date=_compute_next(payload.cycle, payload.day, payload.month),
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _to_dict(s)


@router.put("/{sub_id}")
def update_sub(sub_id: int, payload: SubIn, session: Session = Depends(get_session)):
    s = session.get(Subscription, sub_id)
    if not s:
        raise HTTPException(status_code=404, detail="找不到這個訂閱")
    changed_cycle = (s.cycle, s.day, s.month) != (payload.cycle, payload.day, payload.month)
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    # 週期/日期改了就重算下次扣款日
    if changed_cycle:
        s.next_date = _compute_next(payload.cycle, payload.day, payload.month)
    session.add(s)
    session.commit()
    session.refresh(s)
    return _to_dict(s)


@router.delete("/{sub_id}", status_code=204)
def delete_sub(sub_id: int, session: Session = Depends(get_session)):
    s = session.get(Subscription, sub_id)
    if s:
        session.delete(s)
        session.commit()


@router.post("/{sub_id}/charge-now")
def charge_now(sub_id: int, session: Session = Depends(get_session)):
    """立刻用這個訂閱的內容記一筆（日期為今天），不影響排程。"""
    s = session.get(Subscription, sub_id)
    if not s:
        raise HTTPException(status_code=404, detail="找不到這個訂閱")
    tx = Transaction(
        kind="expense",
        amount=abs(s.amount),
        category=s.category or "訂閱",
        subcategory=s.subcategory or "",
        note=s.note or f"訂閱：{s.name}",
        date=date.today(),
        account=s.account or "",
        account_id=s.account_id,
    )
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return {"ok": True, "transaction_id": tx.id}
