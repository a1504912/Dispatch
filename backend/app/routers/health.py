"""健康：體重／喝水／飲食／運動紀錄。"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import HealthLog
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/health", tags=["health"])

K_WATER_GOAL = "health_water_goal"  # 每日喝水目標（ml）
K_WEIGHT_GOAL = "health_weight_goal"  # 目標體重（kg）


def _parse_date(s: str | None) -> date:
    if not s:
        return date.today()
    try:
        return date.fromisoformat(s)
    except ValueError:
        return date.today()


def _d(log: HealthLog) -> dict:
    return {
        "id": log.id,
        "kind": log.kind,
        "date": log.date.isoformat(),
        "time": log.time,
        "weight": log.weight,
        "amount": log.amount,
        "name": log.name,
        "meal": log.meal,
        "calories": log.calories,
        "duration": log.duration,
        "note": log.note,
    }


# ---------- 某一天的總覽 ----------


@router.get("/day")
def day(date: str | None = None, session: Session = Depends(get_session)):
    d = _parse_date(date)
    rows = session.exec(select(HealthLog).where(HealthLog.date == d)).all()
    weights = sorted(
        [r for r in rows if r.kind == "weight" and r.weight is not None],
        key=lambda r: (r.time or "", r.id or 0),
    )
    waters = [r for r in rows if r.kind == "water" and r.amount]
    foods = sorted([r for r in rows if r.kind == "food"], key=lambda r: (r.time or "", r.id or 0))
    exercises = sorted([r for r in rows if r.kind == "exercise"], key=lambda r: (r.time or "", r.id or 0))

    try:
        water_goal = int(get_setting(session, K_WATER_GOAL, "2000") or 2000)
    except ValueError:
        water_goal = 2000

    latest_weight = weights[-1] if weights else None
    return {
        "date": d.isoformat(),
        "weight": latest_weight.weight if latest_weight else None,
        "weight_id": latest_weight.id if latest_weight else None,
        "water_total": sum(r.amount or 0 for r in waters),
        "water_goal": water_goal,
        "water_logs": [_d(r) for r in sorted(waters, key=lambda r: (r.time or "", r.id or 0))],
        "food": [_d(r) for r in foods],
        "food_calories": sum(r.calories or 0 for r in foods),
        "exercise": [_d(r) for r in exercises],
        "exercise_minutes": sum(r.duration or 0 for r in exercises),
        "exercise_calories": sum(r.calories or 0 for r in exercises),
    }


# ---------- 整月彙總（月曆用） ----------


@router.get("/month")
def month(month: str | None = None, session: Session = Depends(get_session)):
    """回傳某月每天的彙總：{ "YYYY-MM-DD": {weight, food_calories, exercise_calories, water_total, has_exercise} }。"""
    if month:
        try:
            y, m = (int(x) for x in month.split("-")[:2])
        except (ValueError, TypeError):
            t = date.today()
            y, m = t.year, t.month
    else:
        t = date.today()
        y, m = t.year, t.month
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    rows = session.exec(
        select(HealthLog).where(HealthLog.date >= start, HealthLog.date < end)
    ).all()

    days: dict[str, dict] = {}
    weight_pick: dict[str, HealthLog] = {}
    for r in rows:
        key = r.date.isoformat()
        d = days.setdefault(
            key,
            {"weight": None, "food_calories": 0, "exercise_calories": 0, "water_total": 0, "has_exercise": False},
        )
        if r.kind == "weight" and r.weight is not None:
            cur = weight_pick.get(key)
            if not cur or (r.time or "", r.id or 0) > (cur.time or "", cur.id or 0):
                weight_pick[key] = r
                d["weight"] = r.weight
        elif r.kind == "water":
            d["water_total"] += r.amount or 0
        elif r.kind == "food":
            d["food_calories"] += r.calories or 0
        elif r.kind == "exercise":
            d["exercise_calories"] += r.calories or 0
            d["has_exercise"] = True

    goal = get_setting(session, K_WATER_GOAL, "2000")
    return {"month": f"{y:04d}-{m:02d}", "days": days, "water_goal": int(goal or 2000)}


# ---------- 體重趨勢 ----------


@router.get("/weights")
def weights(days: int = 60, session: Session = Depends(get_session)):
    since = date.today() - timedelta(days=max(1, days))
    rows = session.exec(
        select(HealthLog).where(HealthLog.kind == "weight", HealthLog.date >= since)
    ).all()
    # 每天取最後一筆
    by_day: dict[str, HealthLog] = {}
    for r in rows:
        if r.weight is None:
            continue
        key = r.date.isoformat()
        cur = by_day.get(key)
        if not cur or (r.time or "", r.id or 0) > (cur.time or "", cur.id or 0):
            by_day[key] = r
    series = [
        {"date": k, "weight": v.weight}
        for k, v in sorted(by_day.items(), key=lambda kv: kv[0])
    ]
    goal = get_setting(session, K_WEIGHT_GOAL, "")
    return {"series": series, "goal": float(goal) if goal else None}


# ---------- 新增／刪除 ----------


class LogIn(BaseModel):
    kind: str
    date: str | None = None
    time: str = ""
    weight: float | None = None
    amount: int | None = None
    name: str = ""
    meal: str = ""
    calories: int | None = None
    duration: int | None = None
    note: str = ""


@router.post("", status_code=201)
def create_log(payload: LogIn, session: Session = Depends(get_session)):
    if payload.kind not in ("weight", "water", "food", "exercise"):
        raise HTTPException(status_code=400, detail="kind 不合法")
    log = HealthLog(
        kind=payload.kind,
        date=_parse_date(payload.date),
        time=payload.time.strip(),
        weight=payload.weight,
        amount=payload.amount,
        name=payload.name.strip(),
        meal=payload.meal.strip(),
        calories=payload.calories,
        duration=payload.duration,
        note=payload.note.strip(),
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return _d(log)


@router.delete("/{log_id}", status_code=204)
def delete_log(log_id: int, session: Session = Depends(get_session)):
    log = session.get(HealthLog, log_id)
    if log:
        session.delete(log)
        session.commit()


# ---------- 拍照估熱量（呼叫主機上的 Codex / Claude CLI） ----------


class EstimateIn(BaseModel):
    provider: str  # gpt / claude
    image: str  # data URL（data:image/jpeg;base64,...）
    note: str = ""


ESTIMATE_PROMPT = """你是營養師。請看這張餐點照片，辨識出每一樣食物，估算份量與熱量（大卡）。{note}
只輸出一段 JSON，不要任何其他文字或說明，格式：
{{"items":[{{"name":"食物名稱（繁體中文，含大概份量）","calories":整數}}],"total":整數,"note":"一句話說明估算依據或提醒"}}"""


def _parse_estimate(text: str) -> dict:
    """從 AI 回覆裡抓出 JSON；容許前後夾雜文字或 ```json 區塊。"""
    import json as _json
    import re

    s = text.strip()
    s = re.sub(r"^```(?:json)?|```$", "", s, flags=re.M).strip()
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no json")
    data = _json.loads(s[start : end + 1])
    items = []
    for it in data.get("items") or []:
        name = str(it.get("name") or "").strip()
        try:
            cal = int(round(float(it.get("calories"))))
        except (TypeError, ValueError):
            cal = None
        if name:
            items.append({"name": name, "calories": cal})
    total = data.get("total")
    try:
        total = int(round(float(total)))
    except (TypeError, ValueError):
        total = sum(i["calories"] or 0 for i in items)
    return {"items": items, "total": total, "note": str(data.get("note") or "")}


@router.post("/estimate")
def estimate(body: EstimateIn):
    import base64

    from app import ai_advise

    if body.provider not in ("gpt", "claude"):
        raise HTTPException(status_code=400, detail="provider 必須是 gpt 或 claude")
    try:
        header, b64 = body.image.split(",", 1)
        raw = base64.b64decode(b64)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="圖片格式不正確")
    ext = "png" if "png" in header else "webp" if "webp" in header else "jpg"
    note = f"\n使用者補充：{body.note.strip()}" if body.note.strip() else ""
    try:
        answer = ai_advise.ask_with_image(body.provider, ESTIMATE_PROMPT.format(note=note), raw, ext)
    except Exception as exc:  # noqa: BLE001
        # 4xx：避免 5xx 被 Cloudflare 換成它自己的錯誤訊息
        raise HTTPException(status_code=424, detail=str(exc))
    try:
        result = _parse_estimate(answer)
    except Exception:  # noqa: BLE001
        result = {"items": [], "total": None, "note": ""}
    result["raw"] = answer[:2000]
    return result


# ---------- 設定（喝水目標、目標體重） ----------


class HealthSettings(BaseModel):
    water_goal: int | None = None
    weight_goal: float | None = None


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    return {
        "water_goal": int(get_setting(session, K_WATER_GOAL, "2000") or 2000),
        "weight_goal": get_setting(session, K_WEIGHT_GOAL, "") or None,
    }


@router.put("/settings")
def put_settings(payload: HealthSettings, session: Session = Depends(get_session)):
    if payload.water_goal and payload.water_goal > 0:
        set_setting(session, K_WATER_GOAL, str(int(payload.water_goal)))
    if payload.weight_goal is not None:
        set_setting(session, K_WEIGHT_GOAL, str(payload.weight_goal) if payload.weight_goal else "")
    return {"ok": True}
