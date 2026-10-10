import json

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import SplitBill
from app.schemas import SplitBillCreate

router = APIRouter(prefix="/api/splitbills", tags=["splitbills"])


@router.get("", response_model=list[SplitBill])
def list_bills(session: Session = Depends(get_session)):
    return session.exec(
        select(SplitBill).order_by(SplitBill.date.desc(), SplitBill.id.desc())
    ).all()


@router.get("/balances")
def balances(session: Session = Depends(get_session)):
    """算出我和每個成員之間的淨額。正數＝對方欠我，負數＝我欠對方。"""
    bills = session.exec(select(SplitBill).where(SplitBill.settled == False)).all()  # noqa: E712
    net: dict[str, float] = {}
    for bill in bills:
        try:
            shares = json.loads(bill.shares or "[]")
        except (ValueError, TypeError):
            shares = []
        smap = {str(s.get("who")): float(s.get("value", 0)) for s in shares}
        if bill.payer == "self":
            for who, val in smap.items():
                if who != "self":
                    net[who] = round(net.get(who, 0) + val, 2)
        else:
            self_share = smap.get("self", 0)
            if self_share:
                net[bill.payer] = round(net.get(bill.payer, 0) - self_share, 2)
    return {"balances": net}


@router.post("", response_model=SplitBill, status_code=201)
def create_bill(payload: SplitBillCreate, session: Session = Depends(get_session)):
    bill = SplitBill.model_validate(payload)
    session.add(bill)
    session.commit()
    session.refresh(bill)
    return bill


@router.delete("/{bill_id}", status_code=204)
def delete_bill(bill_id: int, session: Session = Depends(get_session)):
    bill = session.get(SplitBill, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    session.delete(bill)
    session.commit()
