"""財政部電子發票（手機條碼載具）串接 —— 用隱形瀏覽器登入抓發票。

財政部已停止「個人」申請 API 金鑰（appID），所以改走：在主機背景開 Playwright
瀏覽器，用使用者的手機號碼/條碼＋驗證碼登入（登入頁有圖形驗證碼，會顯示到前端讓
使用者輸入一次），登入後攔截平台自己的 searchCarrierInvoice 回傳，存進本機資料庫。

帳密只存在自架主機的資料庫（Setting 表），不會上傳任何地方。
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app import invoice_scraper
from app.database import get_session
from app.models import Invoice, Transaction
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

K_CARD = "einvoice_card_no"  # 登入帳號（手機號碼或手機條碼）
K_PW = "einvoice_password"  # 驗證碼（密碼）


# ---------- 設定 ----------


class InvSettings(BaseModel):
    card_no: str = ""
    password: str = ""


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    card_no = get_setting(session, K_CARD)
    pw = get_setting(session, K_PW)
    return {
        "configured": bool(card_no and pw),
        "card_no": card_no,
        "has_password": bool(pw),
        "scraper_ready": invoice_scraper.playwright_available(),
    }


@router.put("/settings")
def put_settings(payload: InvSettings, session: Session = Depends(get_session)):
    set_setting(session, K_CARD, payload.card_no.strip())
    if payload.password.strip():  # 留空 = 不更動
        set_setting(session, K_PW, payload.password.strip())
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
    rows = session.exec(
        select(Invoice).order_by(Invoice.inv_date.desc(), Invoice.id.desc())
    ).all()
    # 對應的記錄若已被刪掉，就把發票放回「可記帳」狀態
    dirty = False
    for r in rows:
        if r.transaction_id and not session.get(Transaction, r.transaction_id):
            r.transaction_id = None
            session.add(r)
            dirty = True
    if dirty:
        session.commit()
    if day:
        rows = [r for r in rows if r.inv_date.isoformat() == day]
    elif month:
        rows = [r for r in rows if r.inv_date.isoformat()[:7] == month]
    return [_to_dict(r) for r in rows]


# ---------- 登入抓發票（兩段式：先拿驗證碼圖，再送驗證碼） ----------


@router.post("/login/start")
def login_start(session: Session = Depends(get_session)):
    if not invoice_scraper.playwright_available():
        raise HTTPException(
            status_code=400,
            detail="主機尚未安裝 Playwright。請在主機執行：pip install playwright && playwright install chromium",
        )
    card_no = get_setting(session, K_CARD)
    pw = get_setting(session, K_PW)
    if not (card_no and pw):
        raise HTTPException(status_code=400, detail="尚未設定手機號碼/條碼與驗證碼（設定→系統）")
    res = invoice_scraper.begin(card_no, pw)
    if not res.get("ok"):
        raise HTTPException(status_code=502, detail=res.get("error") or "開啟登入失敗")
    return {"sid": res["sid"], "captcha_image": res["captcha_image"]}


class CaptchaBody(BaseModel):
    sid: str
    captcha: str


def _upsert(session: Session, rows: list[dict]) -> int:
    added = 0
    for r in rows:
        if session.exec(select(Invoice).where(Invoice.inv_num == r["inv_num"])).first():
            continue
        try:
            y, m, d = (int(x) for x in r["date"].split("-"))
            inv_date = date(y, m, d)
        except Exception:  # noqa: BLE001
            continue
        session.add(
            Invoice(
                inv_num=r["inv_num"],
                inv_date=inv_date,
                seller_name=r.get("seller_name", ""),
                amount=float(r.get("amount") or 0),
                card_type="3J0002",
                status=str(r.get("status") or ""),
                donatable=bool(r.get("donatable")),
            )
        )
        added += 1
    session.commit()
    return added


@router.post("/login/submit")
def login_submit(body: CaptchaBody, session: Session = Depends(get_session)):
    res = invoice_scraper.finish(body.sid, body.captcha)
    if not res.get("ok"):
        raise HTTPException(status_code=502, detail=res.get("error") or "登入或抓取失敗")
    rows = res.get("invoices") or []
    added = _upsert(session, rows)
    return {
        "ok": True,
        "added": added,
        "fetched": len(rows),
        "total_pages": res.get("total_pages"),
        "pages_captured": res.get("pages_captured"),
        "current_url": res.get("current_url"),
        "menu_clicked": res.get("menu_clicked"),
        "on_invoice": res.get("on_invoice"),
        "api_err": res.get("api_err"),
        "api_hits": res.get("api_hits"),
        "buttons": res.get("buttons"),
        "debug": res.get("debug"),
    }


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


class LinkBody(BaseModel):
    transaction_id: int


@router.post("/{invoice_id}/link")
def link_transaction(invoice_id: int, body: LinkBody, session: Session = Depends(get_session)):
    """把一張發票綁定到「使用者自己在編輯視窗建立好」的那筆記錄。"""
    inv = session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="找不到這張發票")
    inv.transaction_id = body.transaction_id
    session.add(inv)
    session.commit()
    return {"ok": True}


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    inv = session.get(Invoice, invoice_id)
    if inv:
        session.delete(inv)
        session.commit()
