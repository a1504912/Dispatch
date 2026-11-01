"""手機通知自動記帳：安卓（MacroDroid／Tasker…）收到付款通知 → 把通知文字送到這裡 → 自動記帳。

- /api/quick-ledger/hook：給手機呼叫，不用登入，改用專屬金鑰（設定頁產生、可隨時換新）
- 先用規則找金額、店家；分類優先沿用「以前同店家記過的」，找不到才問 GPT／Claude（可關）
- 同金額 15 分鐘內已經記過（例：錢包感應＋銀行通知各來一次）就略過，不會記兩筆
- 模式：自動記帳（記完推播，可一鍵復原）或先放「待確認」
"""

import hmac
import json
import re
import secrets
import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine, get_session
from app.models import Account, QuickEntry, Transaction
from app.push import get_setting, send_to_all, set_setting
from app.routers.possessions import today_local

router = APIRouter(prefix="/api/quick-ledger", tags=["quick-ledger"])

K_KEY = "quick_ledger_key"
K_CFG = "quick_ledger_cfg"
DEFAULT_CFG = {
    "enabled": True,
    "mode": "auto",  # auto 自動記帳 / confirm 先放待確認
    "ai": "off",  # off / gpt / claude：同店家沒記過時，用 AI 判斷分類
    "default_account_id": None,
    "source_accounts": {},  # {"LINE": 4, "國泰世華": 3}：依通知來源 App 指定帳戶
    "notify": True,
}

PAY_WORDS = ("付款", "支付", "消費", "扣款", "刷卡", "交易", "感應", "Pay", "pay", "購買", "繳費", "請款", "授權")
INCOME_WORDS = ("入帳", "轉入", "收款", "退款", "退刷", "收到", "存入", "匯入")
AMOUNT_RES = [
    re.compile(r"(?:NT\$|NTD|TWD|新台幣|台幣)\s*([\d,]+(?:\.\d+)?)", re.I),
    re.compile(r"(?:金額|消費|扣款|付款|支付|交易)[^\d\n]{0,6}\$?\s*([\d,]+(?:\.\d+)?)\s*元?"),
    re.compile(r"\$\s*([\d,]+(?:\.\d+)?)"),
    re.compile(r"([\d,]+(?:\.\d+)?)\s*元"),
]
MERCHANT_RES = [
    re.compile(r"(?:商店|店家|特店|商家|消費地點|付款對象|收款方)(?:名稱)?\s*[:：]\s*([^\n，,。；;\s]+)"),
    re.compile(r"(?:於|在)\s*([^\n，,。；;\d$]{2,24}?)\s*(?:消費|付款|刷卡|支付|交易|感應)"),
    re.compile(r"(?:向|給)\s*([^\n，,。；;\d$]{2,24}?)\s*(?:付款|支付)"),
    re.compile(r"(?:向|給)\s*([^\n，,。；;\d$]{2,24})\s*$"),
]
STRONG_CURRENCY = re.compile(r"NT\$|NTD|TWD|\$\s*\d", re.I)


# ---------- 設定 ----------


def get_cfg(session: Session) -> dict:
    try:
        saved = json.loads(get_setting(session, K_CFG, "") or "{}")
    except ValueError:
        saved = {}
    return {**DEFAULT_CFG, **(saved if isinstance(saved, dict) else {})}


def _key(session: Session) -> str:
    k = get_setting(session, K_KEY, "")
    if not k:
        k = secrets.token_urlsafe(24)
        set_setting(session, K_KEY, k)
    return k


# ---------- 解析 ----------


def parse_amount(text: str) -> float | None:
    for rx in AMOUNT_RES:
        for m in rx.finditer(text or ""):
            try:
                v = float(m.group(1).replace(",", ""))
            except ValueError:
                continue
            if 0 < v < 10_000_000:
                return v
    return None


def parse_merchant(text: str) -> str:
    for rx in MERCHANT_RES:
        m = rx.search(text or "")
        if m:
            return m.group(1).strip(" 「」『』\"'")[:30]
    return ""


def looks_like_payment(text: str, has_amount_hint: bool, payment_source: bool = False) -> bool:
    """有付款字眼、或「NT$／$ 金額」、或來源是你設定的付款 App → 當成付款通知；
    聊天訊息（例：「大概 500 元」）兩個條件都沒有就略過。"""
    if has_amount_hint or payment_source:
        return True
    return any(w in text for w in PAY_WORDS + INCOME_WORDS) or bool(STRONG_CURRENCY.search(text))


def _title_merchant(text: str, source: str) -> str:
    """Google 錢包這類通知：標題就是店名（例：標題「全家便利商店」、內容「NT$85 · Visa」）。"""
    title = (text or "").split("\n")[0].strip()
    if "\n" not in (text or "") or not (2 <= len(title) <= 30):
        return ""
    if any(w in title for w in PAY_WORDS + INCOME_WORDS) or re.search(r"\d", title):
        return ""
    if source and (title.lower() in source.lower() or source.lower() in title.lower()):
        return ""
    return title


def _history_match(session: Session, merchant: str):
    """以前記過同一家店：沿用分類／次分類／帳戶（越新的越優先）。"""
    if len(merchant) < 2:
        return None
    rows = session.exec(
        select(Transaction).where(Transaction.kind.in_(["expense", "income"])).order_by(Transaction.date.desc(), Transaction.id.desc()).limit(3000)
    ).all()
    key = merchant.lower()
    for t in rows:
        note = (t.note or "").lower()
        if key in note or (len(note) >= 2 and note in key):
            return t
    return None


def _account_for(session: Session, cfg: dict, source: str) -> int | None:
    src = (source or "").lower()
    for name, acc_id in (cfg.get("source_accounts") or {}).items():
        if name and name.lower() in src and session.get(Account, acc_id):
            return acc_id
    acc = cfg.get("default_account_id")
    return acc if acc and session.get(Account, acc) else None


def _ai_classify(session: Session, provider: str, text: str) -> dict | None:
    """同店家沒記過：請 GPT／Claude 依你的分類判斷（走 AI 記帳同一套）。"""
    from app import ai_advise
    from app.routers.ledger_ai import _clean, _context, _prompt

    ctx = _context(session)
    try:
        raw = ai_advise.ask(provider, _prompt(ctx, f"這是一則手機付款／銀行通知，請整理成一筆記錄：\n{text}"))
    except Exception:  # noqa: BLE001
        return None
    items = _clean(raw, ctx)
    return items[0] if items else None


def process(entry_id: int) -> None:
    """背景處理一則通知（AI 可能要幾十秒，手機那邊不用等）。"""
    with Session(engine) as session:
        e = session.get(QuickEntry, entry_id)
        if not e:
            return
        cfg = get_cfg(session)
        text = e.raw_text
        try:
            amount = e.amount or parse_amount(text)
            # LINE 這種來源也會有聊天訊息，所以不因為來源就放行，一律要有付款字眼或 NT$ 金額
            if not amount or not looks_like_payment(text, bool(e.amount)):
                e.status, e.message = "ignored", "看不出是付款通知（沒有金額或付款字眼），略過"
                session.add(e)
                session.commit()
                return
            e.amount = amount
            e.kind = "income" if any(w in text for w in INCOME_WORDS) and not any(w in text for w in ("付款", "消費", "扣款", "刷卡")) else "expense"
            e.merchant = e.merchant or parse_merchant(text) or _title_merchant(text, e.source)

            # 重複：15 分鐘內同金額已經處理過（錢包感應＋銀行通知常常各來一次）
            since = datetime.utcnow() - timedelta(minutes=15)
            dup = session.exec(
                select(QuickEntry).where(
                    QuickEntry.id != e.id, QuickEntry.created_at >= since, QuickEntry.amount == amount,
                    QuickEntry.status.in_(["recorded", "pending"]),
                )
            ).first()
            if dup:
                e.status, e.message = "duplicate", f"跟 #{dup.id}（{dup.source or '通知'}）是同一筆，略過"
                session.add(e)
                session.commit()
                return

            notes = []
            hist = _history_match(session, e.merchant)
            ai = None
            if hist:
                e.category, e.subcategory = hist.category, hist.subcategory or ""
                notes.append(f"沿用以前「{hist.note}」的分類")
            elif cfg.get("ai") in ("gpt", "claude"):
                ai = _ai_classify(session, cfg["ai"], text)
                if ai:
                    e.category, e.subcategory = ai["category"], ai["subcategory"]
                    e.merchant = e.merchant or ai.get("note", "")
                    notes.append(f"{'GPT' if cfg['ai'] == 'gpt' else 'Claude'} 判斷分類")
            if not e.category:
                e.category = "其他"
                notes.append("沒有判斷出分類，先記「其他」")
            e.account_id = _account_for(session, cfg, e.source)
            if not e.account_id and hist and hist.account_id:
                e.account_id = hist.account_id
            if not e.account_id and ai and ai.get("account"):
                acc = session.exec(select(Account).where(Account.name == ai["account"])).first()
                e.account_id = acc.id if acc else None

            if cfg.get("mode") == "confirm":
                e.status = "pending"
                notes.append("等你確認")
            else:
                tx = _record(session, e)
                e.tx_id, e.status = tx.id, "recorded"
            e.message = "；".join(notes)
            session.add(e)
            session.commit()
            if cfg.get("notify", True):
                _notify(session, e)
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            e = session.get(QuickEntry, entry_id)
            e.status, e.message = "error", f"{type(exc).__name__}: {str(exc)[:150]}"
            session.add(e)
            session.commit()


def _record(session: Session, e: QuickEntry) -> Transaction:
    acc = session.get(Account, e.account_id) if e.account_id else None
    tx = Transaction(
        kind=e.kind, amount=e.amount, category=e.category or "其他", subcategory=e.subcategory or "",
        note=(e.merchant or e.raw_text.replace("\n", " ")[:30]), date=today_local(),
        account=acc.name if acc else "", account_id=e.account_id,
    )
    session.add(tx)
    session.flush()
    return tx


def _notify(session: Session, e: QuickEntry) -> None:
    sign = "+" if e.kind == "income" else "-"
    cat = e.category + (f"・{e.subcategory}" if e.subcategory else "")
    what = f"{sign}${e.amount:,.0f} {cat}" + (f"（{e.merchant}）" if e.merchant else "")
    title = "📲 已自動記帳" if e.status == "recorded" else "📲 有一筆待確認"
    try:
        send_to_all(session, {"title": title, "body": what, "url": "/ledger?quick=1", "tag": f"quick:{e.id}"})
    except Exception:  # noqa: BLE001
        pass


# ---------- 手機呼叫的入口（不用登入，用金鑰） ----------


@router.post("/hook")
async def hook(request: Request, session: Session = Depends(get_session)):
    key = request.headers.get("x-api-key") or request.query_params.get("key") or ""
    if not hmac.compare_digest(key, _key(session)):
        raise HTTPException(401, "金鑰不對")
    cfg = get_cfg(session)
    if not cfg.get("enabled", True):
        return {"ok": False, "detail": "通知記帳已關閉"}
    # 吃 JSON、表單或純文字都可以（MacroDroid／Tasker 各種寫法都能用）
    data: dict = {}
    ctype = request.headers.get("content-type", "")
    raw = (await request.body()).decode("utf-8", errors="replace")
    if "json" in ctype:
        try:
            data = json.loads(raw or "{}")
        except ValueError:
            data = {"text": raw}
    elif "form" in ctype:
        data = dict(await request.form())
    else:
        data = {"text": raw}
    if not isinstance(data, dict):
        data = {"text": str(data)}
    title = str(data.get("title") or "").strip()
    text = str(data.get("text") or data.get("message") or "").strip()
    full = "\n".join(x for x in (title, text) if x)[:2000]
    if not full and not data.get("amount"):
        raise HTTPException(400, "沒有內容")
    amount = parse_amount(str(data.get("amount") or "")) if data.get("amount") else None
    e = QuickEntry(source=str(data.get("source") or data.get("app") or "")[:40], raw_text=full,
                   amount=amount, merchant=str(data.get("merchant") or "")[:30], status="processing")
    session.add(e)
    session.commit()
    session.refresh(e)
    threading.Thread(target=process, args=(e.id,), daemon=True).start()
    return {"ok": True, "id": e.id}


# ---------- 網頁用（要登入） ----------


@router.get("/settings")
def settings_get(request: Request, session: Session = Depends(get_session)):
    base = str(request.base_url).rstrip("/")
    return {**get_cfg(session), "key": _key(session), "hook_path": "/api/quick-ledger/hook", "base_url": base}


class CfgIn(BaseModel):
    enabled: bool = True
    mode: str = "auto"
    ai: str = "off"
    default_account_id: int | None = None
    source_accounts: dict = {}
    notify: bool = True


@router.put("/settings")
def settings_put(p: CfgIn, session: Session = Depends(get_session)):
    cfg = p.model_dump()
    cfg["mode"] = cfg["mode"] if cfg["mode"] in ("auto", "confirm") else "auto"
    cfg["ai"] = cfg["ai"] if cfg["ai"] in ("off", "gpt", "claude") else "off"
    cfg["source_accounts"] = {str(k)[:40]: int(v) for k, v in (cfg["source_accounts"] or {}).items() if str(k).strip() and v}
    set_setting(session, K_CFG, json.dumps(cfg, ensure_ascii=False))
    return get_cfg(session)


@router.post("/settings/rotate-key")
def rotate_key(session: Session = Depends(get_session)):
    set_setting(session, K_KEY, secrets.token_urlsafe(24))
    return {"key": _key(session)}


@router.get("/entries")
def entries(limit: int = 50, session: Session = Depends(get_session)):
    rows = session.exec(select(QuickEntry).order_by(QuickEntry.id.desc()).limit(max(1, min(limit, 200)))).all()
    return [{**r.model_dump(), "created_at": r.created_at.isoformat() + "Z"} for r in rows]


class ConfirmIn(BaseModel):
    kind: str = "expense"
    amount: float
    category: str = "其他"
    subcategory: str = ""
    account_id: int | None = None
    note: str = ""


@router.post("/entries/{entry_id}/confirm")
def confirm(entry_id: int, p: ConfirmIn, session: Session = Depends(get_session)):
    e = session.get(QuickEntry, entry_id)
    if not e or e.status not in ("pending", "ignored", "duplicate", "error", "undone"):
        raise HTTPException(400, "這則不能記帳")
    e.kind = "income" if p.kind == "income" else "expense"
    e.amount, e.category, e.subcategory, e.account_id = abs(p.amount), p.category or "其他", p.subcategory, p.account_id
    e.merchant = p.note or e.merchant
    tx = _record(session, e)
    e.tx_id, e.status = tx.id, "recorded"
    session.add(e)
    session.commit()
    return {"ok": True, "tx_id": tx.id}


@router.post("/entries/{entry_id}/undo")
def undo(entry_id: int, session: Session = Depends(get_session)):
    """自動記錯了：刪掉那筆記帳，這則改成「已復原」（之後還能重新記）。"""
    e = session.get(QuickEntry, entry_id)
    if not e or e.status != "recorded":
        raise HTTPException(400, "這則沒有記帳")
    tx = session.get(Transaction, e.tx_id) if e.tx_id else None
    if tx:
        session.delete(tx)
    e.status, e.tx_id = "undone", None
    session.add(e)
    session.commit()
    return {"ok": True}


@router.delete("/entries/{entry_id}", status_code=204)
def dismiss(entry_id: int, session: Session = Depends(get_session)):
    e = session.get(QuickEntry, entry_id)
    if e:
        session.delete(e)  # 只刪這則紀錄；已記的帳不動
        session.commit()
