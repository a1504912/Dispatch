"""投資（台股）：買賣紀錄、股利、持股與損益，並自動同步到記帳。

記帳的對應方式（買股票不是花掉錢，而是錢換成股票）：
- 買進：轉帳 交割帳戶 → 證券帳戶，金額 = 成交金額 + 手續費（= 這批股票的成本）
- 賣出：轉帳 證券帳戶 → 交割帳戶，金額 = 實拿（扣手續費、證交稅），
        再記一筆「投資收益」收入或「投資損失」支出（帳戶 = 證券帳戶），讓證券帳戶餘額 = 剩餘持股成本
- 現金股利：收入「股利」，帳戶 = 交割帳戶；股票股利只加股數、不動記帳
成本用平均成本法；任何一筆買賣改了，之後所有賣出的損益會重新計算並更新記帳。
"""

import json
from collections import defaultdict
from datetime import date as Date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app import stock_quote
from app.database import get_session
from app.models import Account, InvestDividend, InvestTrade, LedgerCategory, Transaction
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/invest", tags=["invest"])

K_ACCOUNT = "invest_account_id"  # 證券帳戶（記帳裡代表持股成本的帳戶）
K_CASH = "invest_cash_account_id"  # 預設交割帳戶
K_DISCOUNT = "invest_fee_discount"  # 手續費折數，例 0.6 = 6 折
K_MIN_FEE = "invest_min_fee"  # 整股最低手續費
K_MIN_FEE_ODD = "invest_min_fee_odd"  # 零股最低手續費
K_MANUAL = "invest_manual_prices"  # 抓不到報價時手動設定的價格 {代號: 價格}

CAT_GAIN = ("income", "投資收益", "📈")
CAT_LOSS = ("expense", "投資損失", "📉")
CAT_DIV = ("income", "股利", "💰")
EPS = 1e-6


# ---------- 設定 ----------


def _int_or_none(v):
    try:
        return int(v) if str(v or "").strip() else None
    except (TypeError, ValueError):
        return None


def _float(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _settings(session) -> dict:
    try:
        manual = json.loads(get_setting(session, K_MANUAL, "{}") or "{}")
    except ValueError:
        manual = {}
    return {
        "account_id": _int_or_none(get_setting(session, K_ACCOUNT, "")),
        "cash_account_id": _int_or_none(get_setting(session, K_CASH, "")),
        "fee_discount": _float(get_setting(session, K_DISCOUNT, "1"), 1.0),
        "min_fee": _float(get_setting(session, K_MIN_FEE, "20"), 20.0),
        "min_fee_odd": _float(get_setting(session, K_MIN_FEE_ODD, "1"), 1.0),
        "manual_prices": manual if isinstance(manual, dict) else {},
    }


# ---------- 計算（平均成本法） ----------


def _events(session):
    trades = session.exec(select(InvestTrade)).all()
    divs = session.exec(select(InvestDividend)).all()
    ev = [(t.date, 1, t.id or 0, "trade", t) for t in trades]
    ev += [(d.date, 0, d.id or 0, "div", d) for d in divs]  # 同一天先算配股
    ev.sort(key=lambda x: (x[0], x[1], x[2]))
    return ev


def _compute(session) -> dict:
    """依時間順序算出每檔的持股、成本、已實現損益；以及每筆賣出的損益。"""
    st = defaultdict(lambda: {"shares": 0.0, "cost": 0.0, "realized": 0.0, "dividends": 0.0,
                              "fees": 0.0, "taxes": 0.0, "name": "", "trades": 0})
    sell_pl: dict[int, float] = {}
    oversold: list[InvestTrade] = []
    for _, _, _, kind, x in _events(session):
        s = st[x.code]
        if x.name:
            s["name"] = x.name
        if kind == "div":
            s["dividends"] += x.cash or 0
            s["shares"] += x.stock_shares or 0
            continue
        s["trades"] += 1
        s["fees"] += x.fee or 0
        s["taxes"] += x.tax or 0
        if x.side == "buy":
            s["shares"] += x.shares
            s["cost"] += x.shares * x.price + (x.fee or 0)
        else:
            if x.shares > s["shares"] + EPS:
                oversold.append(x)
            sold = min(x.shares, s["shares"])
            removed = s["cost"] * (sold / s["shares"]) if s["shares"] > EPS else 0.0
            proceeds = x.shares * x.price - (x.fee or 0) - (x.tax or 0)
            pl = round(proceeds - removed)
            sell_pl[x.id] = pl
            s["realized"] += pl
            s["shares"] -= sold
            s["cost"] -= removed
            if s["shares"] < EPS:
                s["shares"], s["cost"] = 0.0, 0.0
    return {"codes": st, "sell_pl": sell_pl, "oversold": oversold}


# ---------- 同步到記帳 ----------


def _ensure_cat(session, kind, name, emoji):
    exists = session.exec(
        select(LedgerCategory).where(LedgerCategory.kind == kind, LedgerCategory.name == name,
                                     LedgerCategory.parent_id == None)  # noqa: E711
    ).first()
    if not exists:
        session.add(LedgerCategory(kind=kind, name=name, emoji=emoji, sort=999))


def _acc_name(session, acc_id):
    a = session.get(Account, acc_id) if acc_id else None
    return a.name if a else ""


def _upsert_tx(session, tx_id, **fields) -> int:
    tx = session.get(Transaction, tx_id) if tx_id else None
    if tx is None:
        tx = Transaction(**fields)
    else:
        for k, v in fields.items():
            setattr(tx, k, v)
    session.add(tx)
    session.flush()
    return tx.id


def _drop_tx(session, tx_id):
    tx = session.get(Transaction, tx_id) if tx_id else None
    if tx:
        session.delete(tx)


def _fmt_shares(n: float) -> str:
    n = float(n)
    if n >= 1000 and abs(n % 1000) < EPS:
        return f"{int(n // 1000)} 張"
    return f"{n:g} 股"


def _sync_ledger(session, calc: dict | None = None):
    """把所有投資紀錄對到記帳（新增 / 更新 / 刪除自動產生的那幾筆）。"""
    calc = calc or _compute(session)
    cfg = _settings(session)
    inv_acc = cfg["account_id"] if cfg["account_id"] and session.get(Account, cfg["account_id"]) else None

    for t in session.exec(select(InvestTrade)).all():
        cash = t.cash_account_id if t.cash_account_id and session.get(Account, t.cash_account_id) else None
        if not (t.ledger and inv_acc and cash):
            _drop_tx(session, t.tx_main_id)
            _drop_tx(session, t.tx_pl_id)
            t.tx_main_id = t.tx_pl_id = None
            session.add(t)
            continue
        label = f"{t.code} {t.name}".strip()
        gross = t.shares * t.price
        if t.side == "buy":
            t.tx_main_id = _upsert_tx(
                session, t.tx_main_id, kind="transfer", amount=round(gross + (t.fee or 0)),
                category="", subcategory="", date=t.date, account=_acc_name(session, cash),
                account_id=cash, to_account_id=inv_acc,
                note=f"📈 買進 {label} {_fmt_shares(t.shares)} @{t.price:g}",
            )
            _drop_tx(session, t.tx_pl_id)
            t.tx_pl_id = None
        else:
            t.tx_main_id = _upsert_tx(
                session, t.tx_main_id, kind="transfer",
                amount=round(gross - (t.fee or 0) - (t.tax or 0)),
                category="", subcategory="", date=t.date, account=_acc_name(session, inv_acc),
                account_id=inv_acc, to_account_id=cash,
                note=f"📈 賣出 {label} {_fmt_shares(t.shares)} @{t.price:g}",
            )
            pl = calc["sell_pl"].get(t.id, 0)
            if abs(pl) < 0.5:
                _drop_tx(session, t.tx_pl_id)
                t.tx_pl_id = None
            else:
                kind, cat, emoji = CAT_GAIN if pl > 0 else CAT_LOSS
                _ensure_cat(session, kind, cat, emoji)
                t.tx_pl_id = _upsert_tx(
                    session, t.tx_pl_id, kind=kind, amount=abs(pl), category=cat, subcategory="",
                    date=t.date, account=_acc_name(session, inv_acc), account_id=inv_acc,
                    to_account_id=None, note=f"📈 賣出 {label} 已實現損益",
                )
        session.add(t)

    for d in session.exec(select(InvestDividend)).all():
        cash = d.cash_account_id if d.cash_account_id and session.get(Account, d.cash_account_id) else None
        if not (d.ledger and cash and (d.cash or 0) > 0):
            _drop_tx(session, d.tx_id)
            d.tx_id = None
        else:
            _ensure_cat(session, *CAT_DIV)
            d.tx_id = _upsert_tx(
                session, d.tx_id, kind="income", amount=round(d.cash), category=CAT_DIV[1],
                subcategory="", date=d.date, account=_acc_name(session, cash), account_id=cash,
                to_account_id=None, note=f"📈 {d.code} {d.name} 現金股利".replace("  ", " "),
            )
        session.add(d)


def _commit_checked(session):
    """存檔前檢查：賣出不能超過當時持有的股數。"""
    calc = _compute(session)
    if calc["oversold"]:
        t = calc["oversold"][0]
        session.rollback()
        raise HTTPException(400, f"{t.date} 賣出 {t.code} {t.shares:g} 股，超過當時持有的股數")
    _sync_ledger(session, calc)
    session.commit()


# ---------- API ----------


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    return _settings(session)


class SettingsIn(BaseModel):
    account_id: int | None = None
    cash_account_id: int | None = None
    fee_discount: float | None = None
    min_fee: float | None = None
    min_fee_odd: float | None = None


@router.put("/settings")
def put_settings(payload: SettingsIn, session: Session = Depends(get_session)):
    data = payload.model_dump(exclude_unset=True)
    if "account_id" in data:
        set_setting(session, K_ACCOUNT, str(data["account_id"] or ""))
    if "cash_account_id" in data:
        set_setting(session, K_CASH, str(data["cash_account_id"] or ""))
    if data.get("fee_discount") is not None:
        if not 0 < data["fee_discount"] <= 1:
            raise HTTPException(400, "手續費折數要在 0～1 之間（例：6 折填 0.6）")
        set_setting(session, K_DISCOUNT, str(data["fee_discount"]))
    if data.get("min_fee") is not None:
        set_setting(session, K_MIN_FEE, str(max(0, data["min_fee"])))
    if data.get("min_fee_odd") is not None:
        set_setting(session, K_MIN_FEE_ODD, str(max(0, data["min_fee_odd"])))
    _sync_ledger(session)  # 換了證券帳戶 → 已產生的記帳一起改過去
    session.commit()
    return _settings(session)


@router.post("/setup-account")
def setup_account(session: Session = Depends(get_session)):
    """建立「證券帳戶」並設為投資用帳戶（已經有同名帳戶就直接用）。"""
    acc = session.exec(select(Account).where(Account.name == "證券帳戶")).first()
    if not acc:
        acc = Account(name="證券帳戶", emoji="📈", initial=0, sort=99)
        session.add(acc)
        session.flush()
    set_setting(session, K_ACCOUNT, str(acc.id))
    _sync_ledger(session)
    session.commit()
    return {"account_id": acc.id}


class ManualPriceIn(BaseModel):
    code: str
    price: float | None = None  # None / 0 = 清除


@router.put("/manual-price")
def put_manual_price(payload: ManualPriceIn, session: Session = Depends(get_session)):
    cfg = _settings(session)
    prices = cfg["manual_prices"]
    code = stock_quote.norm_code(payload.code)
    if payload.price and payload.price > 0:
        prices[code] = payload.price
    else:
        prices.pop(code, None)
    set_setting(session, K_MANUAL, json.dumps(prices))
    return {"ok": True}


@router.get("/quote")
def quote(codes: str):
    """查報價：codes=2330,0050"""
    return stock_quote.get_quotes([c for c in codes.split(",") if c.strip()])


@router.get("/portfolio")
def portfolio(session: Session = Depends(get_session)):
    calc = _compute(session)
    cfg = _settings(session)
    codes = calc["codes"]
    held = [c for c, s in codes.items() if s["shares"] > EPS]
    try:
        quotes = stock_quote.get_quotes(held) if held else {}
    except Exception:  # noqa: BLE001
        quotes = {}

    holdings, closed = [], []
    tot = defaultdict(float)
    for code, s in codes.items():
        tot["realized"] += s["realized"]
        tot["dividends"] += s["dividends"]
        if s["shares"] <= EPS:
            closed.append({"code": code, "name": s["name"], "realized": round(s["realized"]),
                           "dividends": round(s["dividends"])})
            continue
        q = quotes.get(code) or {}
        manual = cfg["manual_prices"].get(code)
        price = q.get("price") or manual
        mv = s["shares"] * price if price else None
        unreal = mv - s["cost"] if mv is not None else None
        day_change = s["shares"] * q["change"] if q.get("change") is not None else 0
        holdings.append({
            "code": code,
            "name": s["name"] or q.get("name", ""),
            "shares": s["shares"],
            "cost": round(s["cost"]),
            "avg": round(s["cost"] / s["shares"], 2),
            "price": price,
            "price_source": q.get("source") or ("手動" if manual else None),
            "quote_time": q.get("time", ""),
            "change": q.get("change"),
            "change_pct": q.get("change_pct"),
            "market_value": round(mv) if mv is not None else None,
            "unrealized": round(unreal) if unreal is not None else None,
            "unrealized_pct": round(unreal / s["cost"] * 100, 2) if unreal is not None and s["cost"] else None,
            "day_change": round(day_change),
            "realized": round(s["realized"]),
            "dividends": round(s["dividends"]),
        })
        tot["cost"] += s["cost"]
        tot["market_value"] += mv if mv is not None else s["cost"]
        tot["day_change"] += day_change
    holdings.sort(key=lambda h: -(h["market_value"] or h["cost"]))
    closed.sort(key=lambda h: h["code"])

    unreal = tot["market_value"] - tot["cost"]
    trades = sorted(session.exec(select(InvestTrade)).all(), key=lambda t: (t.date, t.id), reverse=True)
    divs = sorted(session.exec(select(InvestDividend)).all(), key=lambda d: (d.date, d.id), reverse=True)
    return {
        "summary": {
            "cost": round(tot["cost"]),
            "market_value": round(tot["market_value"]),
            "unrealized": round(unreal),
            "unrealized_pct": round(unreal / tot["cost"] * 100, 2) if tot["cost"] else None,
            "day_change": round(tot["day_change"]),
            "realized": round(tot["realized"]),
            "dividends": round(tot["dividends"]),
            "total_return": round(unreal + tot["realized"] + tot["dividends"]),
            "quotes_missing": [h["code"] for h in holdings if h["price"] is None],
        },
        "holdings": holdings,
        "closed": closed,
        "trades": [{**t.model_dump(), "realized": calc["sell_pl"].get(t.id)} for t in trades],
        "dividends": [d.model_dump() for d in divs],
        "settings": cfg,
    }


class TradeIn(BaseModel):
    date: Date
    code: str
    name: str = ""
    side: str = "buy"
    shares: float
    price: float
    fee: float = 0
    tax: float = 0
    cash_account_id: int | None = None
    ledger: bool = True
    note: str = ""


def _clean_trade(p: TradeIn) -> dict:
    d = p.model_dump()
    d["code"] = stock_quote.norm_code(d["code"])
    if not stock_quote.CODE_RE.match(d["code"]):
        raise HTTPException(400, "股票代號格式不對（例：2330、0050、00679B）")
    if d["side"] not in ("buy", "sell"):
        raise HTTPException(400, "side 只能是 buy 或 sell")
    if d["shares"] <= 0 or d["price"] <= 0:
        raise HTTPException(400, "股數和價格要大於 0")
    if d["fee"] < 0 or d["tax"] < 0:
        raise HTTPException(400, "手續費 / 證交稅不能是負的")
    if d["side"] == "buy":
        d["tax"] = 0
    d["name"] = d["name"].strip()
    return d


@router.post("/trades", status_code=201)
def create_trade(payload: TradeIn, session: Session = Depends(get_session)):
    t = InvestTrade(**_clean_trade(payload))
    session.add(t)
    session.flush()
    tid = t.id
    _commit_checked(session)
    return session.get(InvestTrade, tid)


@router.put("/trades/{trade_id}")
def update_trade(trade_id: int, payload: TradeIn, session: Session = Depends(get_session)):
    t = session.get(InvestTrade, trade_id)
    if not t:
        raise HTTPException(404, "找不到這筆交易")
    for k, v in _clean_trade(payload).items():
        setattr(t, k, v)
    session.add(t)
    session.flush()
    _commit_checked(session)
    return session.get(InvestTrade, trade_id)


@router.delete("/trades/{trade_id}", status_code=204)
def delete_trade(trade_id: int, session: Session = Depends(get_session)):
    t = session.get(InvestTrade, trade_id)
    if not t:
        raise HTTPException(404, "找不到這筆交易")
    _drop_tx(session, t.tx_main_id)
    _drop_tx(session, t.tx_pl_id)
    session.delete(t)
    session.flush()
    _commit_checked(session)  # 刪掉買進可能讓之後的賣出不合理 → 擋下來


class DividendIn(BaseModel):
    date: Date
    code: str
    name: str = ""
    cash: float = 0
    stock_shares: float = 0
    cash_account_id: int | None = None
    ledger: bool = True
    note: str = ""


def _clean_div(p: DividendIn) -> dict:
    d = p.model_dump()
    d["code"] = stock_quote.norm_code(d["code"])
    if not stock_quote.CODE_RE.match(d["code"]):
        raise HTTPException(400, "股票代號格式不對")
    if d["cash"] < 0 or d["stock_shares"] < 0 or (d["cash"] <= 0 and d["stock_shares"] <= 0):
        raise HTTPException(400, "現金股利或配股至少要填一個")
    d["name"] = d["name"].strip()
    return d


@router.post("/dividends", status_code=201)
def create_dividend(payload: DividendIn, session: Session = Depends(get_session)):
    d = InvestDividend(**_clean_div(payload))
    session.add(d)
    session.flush()
    did = d.id
    _commit_checked(session)
    return session.get(InvestDividend, did)


@router.put("/dividends/{div_id}")
def update_dividend(div_id: int, payload: DividendIn, session: Session = Depends(get_session)):
    d = session.get(InvestDividend, div_id)
    if not d:
        raise HTTPException(404, "找不到這筆股利")
    for k, v in _clean_div(payload).items():
        setattr(d, k, v)
    session.add(d)
    session.flush()
    _commit_checked(session)
    return session.get(InvestDividend, div_id)


@router.delete("/dividends/{div_id}", status_code=204)
def delete_dividend(div_id: int, session: Session = Depends(get_session)):
    d = session.get(InvestDividend, div_id)
    if not d:
        raise HTTPException(404, "找不到這筆股利")
    _drop_tx(session, d.tx_id)
    session.delete(d)
    session.flush()
    _commit_checked(session)
