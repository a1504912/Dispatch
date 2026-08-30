"""財政部電子發票（手機條碼載具）串接。

用官方免費 API（電子發票整合服務平台）把載具歸戶的發票拉回來，
不需要碰任何密碼爬蟲。需要三樣東西（存在設定裡）：
  1. appID：到 https://www.einvoice.nat.gov.tw 申請的 API 金鑰（免費）
  2. 手機條碼：格式 /XXXXXXX（斜線開頭共 8 碼）
  3. 載具驗證碼：申請手機條碼時設定的密碼
"""

import json
import re
import time
from datetime import date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Invoice, Transaction
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

API_URL = "https://api.einvoice.nat.gov.tw/PB2CAPIVAN/invapp/InvApp"
CARD_TYPE = "3J0002"  # 手機條碼載具

K_APP = "einvoice_app_id"
K_CARD = "einvoice_card_no"
K_ENC = "einvoice_card_encrypt"


# ---------- 設定 ----------


def _creds(session: Session) -> tuple[str, str, str]:
    return (
        get_setting(session, K_APP),
        get_setting(session, K_CARD),
        get_setting(session, K_ENC),
    )


class InvSettings(BaseModel):
    app_id: str = ""
    card_no: str = ""
    card_encrypt: str = ""


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    app_id, card_no, enc = _creds(session)
    return {
        "configured": bool(app_id and card_no and enc),
        "app_id": app_id,
        "card_no": card_no,
        "has_encrypt": bool(enc),  # 驗證碼不回傳明碼
    }


@router.put("/settings")
def put_settings(payload: InvSettings, session: Session = Depends(get_session)):
    set_setting(session, K_APP, payload.app_id.strip())
    set_setting(session, K_CARD, payload.card_no.strip())
    # 驗證碼留空 = 不更動（前端不會回傳既有值）
    if payload.card_encrypt.strip():
        set_setting(session, K_ENC, payload.card_encrypt.strip())
    return {"ok": True}


# ---------- 查詢（本機資料庫） ----------


def _to_dict(inv: Invoice) -> dict:
    return {
        "id": inv.id,
        "inv_num": inv.inv_num,
        "date": inv.inv_date.isoformat(),
        "seller_name": inv.seller_name,
        "amount": inv.amount,
        "status": inv.status,
        "transaction_id": inv.transaction_id,
    }


@router.get("")
def list_invoices(
    month: str | None = None,  # "YYYY-MM"
    day: str | None = None,  # "YYYY-MM-DD"
    session: Session = Depends(get_session),
):
    q = select(Invoice)
    rows = session.exec(q.order_by(Invoice.inv_date.desc(), Invoice.id.desc())).all()
    if day:
        rows = [r for r in rows if r.inv_date.isoformat() == day]
    elif month:
        rows = [r for r in rows if r.inv_date.isoformat()[:7] == month]
    return [_to_dict(r) for r in rows]


# ---------- 同步（打財政部 API） ----------


def _parse_date(raw: str) -> date | None:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) < 8:
        return None
    digits = digits[-8:] if len(digits) > 8 else digits
    try:
        return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
    except ValueError:
        return None


def _call_agg(app_id: str, card_no: str, enc: str, start: date, end: date) -> list[dict]:
    body = {
        "version": "1.0",
        "cardType": CARD_TYPE,
        "cardNo": card_no,
        "expTimeStamp": "2147483647",
        "timeStamp": str(int(time.time()) + 10),
        "action": "qryCarrierAgg",
        "cardEncrypt": enc,
        "onlyWinningInv": "N",
        "uuid": "dispatch",
        "appID": app_id,
        "startDate": start.strftime("%Y/%m/%d"),
        "endDate": end.strftime("%Y/%m/%d"),
    }
    try:
        r = httpx.post(API_URL, data=body, timeout=30)
        r.raise_for_status()
        j = r.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"連不到財政部電子發票平台：{exc}") from exc

    code = str(j.get("code", ""))
    if code != "200":
        raise HTTPException(status_code=400, detail=f"財政部回應：{j.get('msg') or code or '查詢失敗'}")
    return j.get("details") or []


class SyncBody(BaseModel):
    days: int = 60  # 往前抓幾天


@router.post("/sync")
def sync_invoices(body: SyncBody, session: Session = Depends(get_session)):
    app_id, card_no, enc = _creds(session)
    if not (app_id and card_no and enc):
        raise HTTPException(status_code=400, detail="尚未設定發票載具（appID／手機條碼／驗證碼）")

    end = date.today()
    start = end - timedelta(days=max(1, min(body.days, 365)))
    details = _call_agg(app_id, card_no, enc, start, end)

    added = 0
    for d in details:
        inv_num = (d.get("invNum") or d.get("invnum") or "").strip()
        if not inv_num:
            continue
        if session.exec(select(Invoice).where(Invoice.inv_num == inv_num)).first():
            continue  # 已存在就跳過
        inv_date = _parse_date(d.get("invDate") or d.get("invdate") or "")
        if not inv_date:
            continue
        try:
            amount = float(re.sub(r"[^\d.\-]", "", str(d.get("amount", "0"))) or 0)
        except ValueError:
            amount = 0
        session.add(
            Invoice(
                inv_num=inv_num,
                inv_date=inv_date,
                seller_name=(d.get("sellerName") or d.get("sellername") or "").strip(),
                seller_ban=(d.get("sellerBan") or "").strip(),
                amount=amount,
                card_type=CARD_TYPE,
                status=(d.get("invStatus") or d.get("invstatus") or "").strip(),
                donatable=str(d.get("donateMark", "")).strip() in ("0", ""),
            )
        )
        added += 1
    session.commit()
    return {"ok": True, "added": added, "fetched": len(details), "start": start.isoformat(), "end": end.isoformat()}


# ---------- 把一張發票記成一筆支出 ----------


class ToTxBody(BaseModel):
    category: str = "購物"
    account_id: int | None = None


@router.post("/{invoice_id}/to-transaction")
def to_transaction(invoice_id: int, body: ToTxBody, session: Session = Depends(get_session)):
    inv = session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="找不到這張發票")
    if inv.transaction_id and session.get(Transaction, inv.transaction_id):
        raise HTTPException(status_code=400, detail="這張發票已經記過帳了")
    tx = Transaction(
        kind="expense",
        amount=abs(inv.amount),
        category=body.category or "購物",
        note=f"發票 {inv.inv_num}｜{inv.seller_name}".strip("｜"),
        date=inv.inv_date,
        account_id=body.account_id,
    )
    session.add(tx)
    session.commit()
    session.refresh(tx)
    inv.transaction_id = tx.id
    session.add(inv)
    session.commit()
    return {"ok": True, "transaction_id": tx.id}


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    inv = session.get(Invoice, invoice_id)
    if inv:
        session.delete(inv)
        session.commit()
