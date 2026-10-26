"""記帳：截圖（收據、發票、刷卡／轉帳通知、LINE Pay、網購訂單…）或打字描述 → AI 整理成記錄（還沒存）。

走主機上已登入的 Codex（GPT）／Claude Code CLI，不另外付 API 費用。
會把使用者自己的分類（含次分類）、帳戶名稱一起給 AI，讓它直接選對；回來後再檢查一次，不認識的分類改成「其他」。
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Account, LedgerCategory
from app.routers.possessions import today_local
from app.routers.schedule import _loads_loose

router = APIRouter(prefix="/api/ledger-ai", tags=["ledger-ai"])

MAX_IMAGE = 15 * 1024 * 1024


def _context(session: Session) -> dict:
    cats = session.exec(select(LedgerCategory).order_by(LedgerCategory.sort, LedgerCategory.id)).all()
    tops = [c for c in cats if not c.parent_id]
    tree = {"expense": {}, "income": {}}
    for t in tops:
        tree.setdefault(t.kind, {})[t.name] = [c.name for c in cats if c.parent_id == t.id]
    accs = session.exec(select(Account).order_by(Account.sort, Account.id)).all()
    # 可記帳的帳戶：子帳戶，或沒有子帳戶的類型
    leaves = [a for a in accs if a.parent_id or not any(x.parent_id == a.id for x in accs)]
    return {"tree": tree, "accounts": [a.name for a in leaves]}


def _prompt(ctx: dict, task: str) -> str:
    def fmt(kind):
        return "；".join(f"{k}（{('、'.join(v)) or '無次分類'}）" for k, v in ctx["tree"].get(kind, {}).items())

    today = today_local()
    return (
        "你是記帳助手，把使用者給的內容整理成一筆筆收支記錄。\n"
        f"今天是 {today.isoformat()}（{'一二三四五六日'[today.weekday()]}），相對日期（昨天、上週五）依此推算；"
        "沒寫年份就用今年，沒有日期就用今天。\n"
        f"支出分類：{fmt('expense')}\n"
        f"收入分類：{fmt('income')}\n"
        f"帳戶：{'、'.join(ctx['accounts'])}\n"
        "規則：\n"
        "- 收據／發票／訂單：整張記成一筆（用總金額），品項寫在 note，不要每個品項拆一筆。\n"
        "- 刷卡／銀行／行動支付的交易清單：每一筆交易各記一筆；餘額、額度、累計那種數字不要記。\n"
        "- 金額一律正數；退款、入帳、收款記成 income。\n"
        "- category 必須是上面的主分類名稱，subcategory 是它底下的次分類（沒適合的留空字串）；"
        "都不適合就用「其他」。\n"
        "- account 只能填上面的帳戶名稱之一（從畫面判斷：信用卡、LINE Pay＝電子支付、現金…），判斷不出來留空字串。\n"
        "- note 寫店家／品項，簡短（20 字內）。\n"
        "只輸出一個 JSON 物件，不要任何說明文字、不要 ``` 標記，格式：\n"
        '{"items":[{"kind":"expense","amount":120,"category":"餐飲","subcategory":"午餐",'
        '"date":"YYYY-MM-DD","account":"現金","note":"八方雲集"}]}\n'
        '看不到任何收支就回 {"items":[]}。\n\n'
        + task
    )


def _clean(raw, ctx: dict) -> list[dict]:
    data = _loads_loose(raw)
    items = data.get("items") if isinstance(data, dict) else data
    out = []
    today = today_local().isoformat()
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        try:
            amount = abs(float(str(it.get("amount", "")).replace(",", "").replace("$", "")))
        except ValueError:
            continue
        if amount <= 0:
            continue
        kind = "income" if it.get("kind") == "income" else "expense"
        cats = ctx["tree"].get(kind, {})
        cat = str(it.get("category") or "").strip()
        if cat not in cats:
            cat = "其他" if "其他" in cats else (next(iter(cats), ""))
        sub = str(it.get("subcategory") or "").strip()
        if sub not in cats.get(cat, []):
            sub = ""
        d = str(it.get("date") or "")[:10]
        try:
            d = datetime.strptime(d, "%Y-%m-%d").date().isoformat()
        except ValueError:
            d = today
        acc = str(it.get("account") or "").strip()
        out.append({
            "kind": kind,
            "amount": round(amount, 2),
            "category": cat,
            "subcategory": sub,
            "date": d,
            "account": acc if acc in ctx["accounts"] else "",
            "note": str(it.get("note") or "").strip()[:60],
        })
    return out


async def _ask(provider: str, prompt: str, image: bytes | None = None, ext: str = "png") -> str:
    from app import ai_advise

    if provider not in ("gpt", "claude"):
        raise HTTPException(400, "provider 必須是 gpt 或 claude")
    try:
        if image is not None:
            return await run_in_threadpool(ai_advise.ask_with_image, provider, prompt, image, ext)
        return await run_in_threadpool(ai_advise.ask, provider, prompt)
    except (RuntimeError, ValueError) as exc:
        name = "GPT" if provider == "gpt" else "Claude"
        raise HTTPException(424, f"{name} 解析失敗：{exc}") from exc


def _result(content: str, ctx: dict) -> dict:
    items = _clean(content, ctx)
    if not items and _loads_loose(content) is None:
        raise HTTPException(424, f"AI 回覆看不懂：{str(content)[:200]}")
    return {"items": items}


@router.post("/from-image")
async def from_image(
    file: UploadFile = File(...),
    provider: str = Form("gpt"),
    hint: Optional[str] = Form(None),
    session: Session = Depends(get_session),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "空的圖片檔")
    if len(raw) > MAX_IMAGE:
        raise HTTPException(400, "圖片太大（上限 15MB）")
    ctype = (file.content_type or "").lower()
    ext = "jpg" if ("jpeg" in ctype or "jpg" in ctype) else "webp" if "webp" in ctype else "png"
    ctx = _context(session)
    task = "請看這張截圖，找出裡面的收支。"
    if hint and hint.strip():
        task += f"\n使用者補充說明（以此為準）：{hint.strip()[:500]}"
    return _result(await _ask(provider, _prompt(ctx, task), raw, ext), ctx)


class TextIn(BaseModel):
    text: str
    provider: str = "gpt"


@router.post("/from-text")
async def from_text(payload: TextIn, session: Session = Depends(get_session)):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(400, "請輸入內容")
    if len(text) > 4000:
        raise HTTPException(400, "內容太長（上限 4000 字）")
    ctx = _context(session)
    return _result(await _ask(payload.provider, _prompt(ctx, f"使用者的描述：\n{text}")), ctx)
