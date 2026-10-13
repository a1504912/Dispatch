"""自媒體：貼文編輯、主題方向（content pillar）、成效數據與分析、AI 小編。"""

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app import thumbs
from app.database import get_session
from app.models import MediaMetric, MediaPillar, MediaPost

router = APIRouter(prefix="/api/media", tags=["media"])

PLATFORMS = {"instagram", "facebook", "threads", "youtube", "tiktok", "x", "blog", "other"}
STATUSES = {"idea", "draft", "scheduled", "published"}
MAX_IMAGES = 20
MAX_IMAGE_CHARS = 8_000_000  # 單張 data URL 上限（前端已壓縮，正常遠小於此）
WEEKDAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]


# ---------- 主題方向 ----------
class PillarIn(BaseModel):
    name: str
    description: str = ""
    audience: str = ""
    tone: str = ""
    color: str = "#2a78d6"
    target_ratio: int = 0


def _check_pillar_in(body: PillarIn) -> None:
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="主題名稱不能空白")
    if not 0 <= body.target_ratio <= 100:
        raise HTTPException(status_code=400, detail="目標比例要在 0–100 之間")


@router.get("/pillars")
def list_pillars(session: Session = Depends(get_session)):
    return session.exec(select(MediaPillar).order_by(MediaPillar.id)).all()


@router.post("/pillars")
def create_pillar(body: PillarIn, session: Session = Depends(get_session)):
    _check_pillar_in(body)
    pillar = MediaPillar(**body.model_dump())
    session.add(pillar)
    session.commit()
    session.refresh(pillar)
    return pillar


@router.put("/pillars/{pillar_id}")
def update_pillar(pillar_id: int, body: PillarIn, session: Session = Depends(get_session)):
    pillar = session.get(MediaPillar, pillar_id)
    if not pillar:
        raise HTTPException(status_code=404, detail="找不到這個主題")
    _check_pillar_in(body)
    for key, value in body.model_dump().items():
        setattr(pillar, key, value)
    session.add(pillar)
    session.commit()
    session.refresh(pillar)
    return pillar


@router.delete("/pillars/{pillar_id}")
def delete_pillar(pillar_id: int, session: Session = Depends(get_session)):
    pillar = session.get(MediaPillar, pillar_id)
    if not pillar:
        raise HTTPException(status_code=404, detail="找不到這個主題")
    # 貼文保留，只是變成未分類
    for post in session.exec(select(MediaPost).where(MediaPost.pillar_id == pillar_id)).all():
        post.pillar_id = None
        session.add(post)
    session.delete(pillar)
    session.commit()
    return {"ok": True}


# ---------- 貼文 ----------
class PostIn(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    platform: Optional[str] = None
    status: Optional[str] = None
    pillar_id: Optional[int] = None
    tags: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    url: Optional[str] = None
    images: Optional[list[str]] = None


def _latest_metrics(session: Session, post_ids: list[int]) -> dict[int, MediaMetric]:
    """每篇最新一筆數據。數字是累計值，所以最新一筆＝目前總數。"""
    if not post_ids:
        return {}
    rows = session.exec(
        select(MediaMetric)
        .where(MediaMetric.post_id.in_(post_ids))
        .order_by(MediaMetric.recorded_at, MediaMetric.id)
    ).all()
    latest: dict[int, MediaMetric] = {}
    for row in rows:
        latest[row.post_id] = row
    return latest


def _parse_images(post: MediaPost) -> list[str]:
    try:
        arr = json.loads(post.images or "[]")
        return [x for x in arr if isinstance(x, str)] if isinstance(arr, list) else []
    except (ValueError, TypeError):
        return []


def _post_out(post: MediaPost, metric: Optional[MediaMetric], full: bool = False) -> dict:
    """列表只帶縮圖與張數；開單篇（full）才帶全部圖片。"""
    data = post.model_dump(exclude={"images"})
    images = _parse_images(post)
    data["image_count"] = len(images)
    data["latest_metric"] = metric.model_dump() if metric else None
    if full:
        data["images"] = images
    return data


def _get_post(session: Session, post_id: int) -> MediaPost:
    post = session.get(MediaPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="找不到這篇貼文")
    return post


def _apply(post: MediaPost, changes: dict, session: Session) -> None:
    if "title" in changes and not (changes["title"] or "").strip():
        raise HTTPException(status_code=400, detail="標題不能空白")
    if "platform" in changes and changes["platform"] not in PLATFORMS:
        raise HTTPException(status_code=400, detail="不支援的平台")
    if "status" in changes and changes["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail="不支援的狀態")
    if changes.get("pillar_id") is not None and not session.get(MediaPillar, changes["pillar_id"]):
        raise HTTPException(status_code=400, detail="找不到這個主題")
    if "images" in changes:
        images = [x for x in (changes.pop("images") or []) if isinstance(x, str) and x.startswith("data:image/")]
        if len(images) > MAX_IMAGES:
            raise HTTPException(status_code=400, detail=f"一篇最多 {MAX_IMAGES} 張圖")
        if any(len(x) > MAX_IMAGE_CHARS for x in images):
            raise HTTPException(status_code=400, detail="有圖片太大，請換小一點的圖")
        post.images = json.dumps(images) if images else None
        post.thumb = thumbs.make_thumb(images[0]) if images else None
    for key, value in changes.items():
        setattr(post, key, value)
    # 標成已發佈但沒填時間 → 用預計發佈時間，沒有就用現在
    if post.status == "published" and post.published_at is None:
        post.published_at = post.scheduled_at or datetime.now().replace(second=0, microsecond=0)


@router.get("/posts")
def list_posts(session: Session = Depends(get_session)):
    posts = session.exec(select(MediaPost).order_by(MediaPost.updated_at.desc())).all()
    metrics = _latest_metrics(session, [p.id for p in posts])
    return [_post_out(p, metrics.get(p.id)) for p in posts]


@router.get("/posts/{post_id}")
def get_post(post_id: int, session: Session = Depends(get_session)):
    post = _get_post(session, post_id)
    return _post_out(post, _latest_metrics(session, [post_id]).get(post_id), full=True)


@router.post("/posts")
def create_post(body: PostIn, session: Session = Depends(get_session)):
    changes = body.model_dump(exclude_unset=True)
    changes.setdefault("title", "未命名貼文")
    post = MediaPost(title=changes["title"])
    _apply(post, changes, session)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _post_out(post, None, full=True)


@router.put("/posts/{post_id}")
def update_post(post_id: int, body: PostIn, session: Session = Depends(get_session)):
    post = _get_post(session, post_id)
    _apply(post, body.model_dump(exclude_unset=True), session)
    post.updated_at = datetime.utcnow()
    session.add(post)
    session.commit()
    session.refresh(post)
    return _post_out(post, _latest_metrics(session, [post_id]).get(post_id), full=True)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, session: Session = Depends(get_session)):
    post = _get_post(session, post_id)
    for metric in session.exec(select(MediaMetric).where(MediaMetric.post_id == post_id)).all():
        session.delete(metric)
    session.delete(post)
    session.commit()
    return {"ok": True}


# ---------- 成效數據 ----------
class MetricIn(BaseModel):
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    followers_gained: int = 0
    recorded_at: Optional[datetime] = None


@router.get("/posts/{post_id}/metrics")
def list_metrics(post_id: int, session: Session = Depends(get_session)):
    _get_post(session, post_id)
    return session.exec(
        select(MediaMetric)
        .where(MediaMetric.post_id == post_id)
        .order_by(MediaMetric.recorded_at, MediaMetric.id)
    ).all()


@router.post("/posts/{post_id}/metrics")
def add_metric(post_id: int, body: MetricIn, session: Session = Depends(get_session)):
    _get_post(session, post_id)
    data = body.model_dump()
    if any(data[k] < 0 for k in ("views", "likes", "comments", "shares", "saves")):
        raise HTTPException(status_code=400, detail="數字不能是負的")
    if data["recorded_at"] is None:
        data["recorded_at"] = datetime.now().replace(microsecond=0)
    metric = MediaMetric(post_id=post_id, **data)
    session.add(metric)
    session.commit()
    session.refresh(metric)
    return metric


@router.delete("/posts/{post_id}/metrics/{metric_id}")
def delete_metric(post_id: int, metric_id: int, session: Session = Depends(get_session)):
    metric = session.get(MediaMetric, metric_id)
    if not metric or metric.post_id != post_id:
        raise HTTPException(status_code=404, detail="找不到這筆數據")
    session.delete(metric)
    session.commit()
    return {"ok": True}


# ---------- 數據分析 ----------
def _engagement(m: Optional[MediaMetric]) -> int:
    return m.likes + m.comments + m.shares + m.saves if m else 0


def _rate(engagement: int, views: int) -> float:
    return round(engagement / views * 100, 2) if views else 0.0


def _post_date(post: MediaPost) -> datetime:
    return post.published_at or post.scheduled_at or post.created_at


def _week_start(dt: datetime) -> datetime:
    return (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/analytics")
def analytics(
    days: Optional[int] = Query(default=None, ge=1, le=3650),
    session: Session = Depends(get_session),
):
    """分析頁一次要的全部資料。

    每篇用最新一筆數據；days 依發佈時間（沒有就用排程 / 建立時間）篩選，
    每週趨勢固定看最近 12 週。互動 = 讚 + 留言 + 分享 + 收藏；互動率 = 互動 ÷ 觸及。
    """
    now = datetime.now()
    all_posts = session.exec(select(MediaPost)).all()
    posts = all_posts
    if days:
        cutoff = now - timedelta(days=days)
        posts = [p for p in all_posts if _post_date(p) >= cutoff]
    pillars = session.exec(select(MediaPillar).order_by(MediaPillar.id)).all()
    metrics = _latest_metrics(session, [p.id for p in all_posts])

    # ---- 總計 ----
    totals = defaultdict(int)
    for post in posts:
        totals[f"status_{post.status}"] += 1
        m = metrics.get(post.id)
        if m:
            for key in ("views", "likes", "comments", "shares", "saves", "followers_gained"):
                totals[key] += getattr(m, key)
    engagement_total = totals["likes"] + totals["comments"] + totals["shares"] + totals["saves"]

    # ---- 各平台 ----
    by_platform: dict[str, dict] = {}
    for post in posts:
        row = by_platform.setdefault(
            post.platform, {"platform": post.platform, "posts": 0, "views": 0, "engagement": 0}
        )
        m = metrics.get(post.id)
        row["posts"] += 1
        row["views"] += m.views if m else 0
        row["engagement"] += _engagement(m)
    for row in by_platform.values():
        row["engagement_rate"] = _rate(row["engagement"], row["views"])

    # ---- 主題方向：實際 vs 目標（只算草稿以上，不含點子）----
    committed = [p for p in posts if p.status != "idea"]
    groups: list[tuple[Optional[MediaPillar], list[MediaPost]]] = [
        (pl, [p for p in committed if p.pillar_id == pl.id]) for pl in pillars
    ]
    known = {pl.id for pl in pillars}
    unassigned = [p for p in committed if p.pillar_id not in known]
    if unassigned:
        groups.append((None, unassigned))
    by_pillar = []
    for pillar, group in groups:
        views = sum(metrics[p.id].views for p in group if p.id in metrics)
        engagement = sum(_engagement(metrics.get(p.id)) for p in group)
        by_pillar.append(
            {
                "pillar_id": pillar.id if pillar else None,
                "name": pillar.name if pillar else "未分類",
                "color": pillar.color if pillar else "#898781",
                "target_ratio": pillar.target_ratio if pillar else 0,
                "posts": len(group),
                "actual_ratio": round(len(group) / len(committed) * 100, 1) if committed else 0.0,
                "views": views,
                "engagement": engagement,
                "engagement_rate": _rate(engagement, views),
            }
        )

    # ---- 熱門貼文 ----
    pillar_names = {pl.id: pl.name for pl in pillars}
    measured = [p for p in posts if p.id in metrics]
    top = sorted(measured, key=lambda p: metrics[p.id].views, reverse=True)[:10]

    # ---- 每週趨勢（已發佈，最近 12 週）----
    this_monday = _week_start(now)
    weeks = [this_monday - timedelta(weeks=i) for i in range(11, -1, -1)]
    weekly = {w: {"posts": 0, "views": 0, "engagement": 0} for w in weeks}
    for post in all_posts:
        if post.status != "published" or not post.published_at:
            continue
        bucket = weekly.get(_week_start(post.published_at))
        if bucket is None:
            continue
        m = metrics.get(post.id)
        bucket["posts"] += 1
        bucket["views"] += m.views if m else 0
        bucket["engagement"] += _engagement(m)

    # ---- 星期幾（期間內已發佈且有數據）----
    by_weekday = [{"weekday": d, "posts": 0, "views": 0, "engagement": 0} for d in WEEKDAYS]
    for post in posts:
        m = metrics.get(post.id)
        if post.status != "published" or not post.published_at or not m:
            continue
        day = by_weekday[post.published_at.weekday()]
        day["posts"] += 1
        day["views"] += m.views
        day["engagement"] += _engagement(m)
    for day in by_weekday:
        day["avg_views"] = round(day["views"] / day["posts"]) if day["posts"] else 0
        day["engagement_rate"] = _rate(day["engagement"], day["views"])

    return {
        "window_days": days,
        "totals": {
            "posts": len(posts),
            "ideas": totals["status_idea"],
            "drafts": totals["status_draft"],
            "scheduled": totals["status_scheduled"],
            "published": totals["status_published"],
            "views": totals["views"],
            "likes": totals["likes"],
            "comments": totals["comments"],
            "shares": totals["shares"],
            "saves": totals["saves"],
            "followers_gained": totals["followers_gained"],
            "engagement": engagement_total,
            "engagement_rate": _rate(engagement_total, totals["views"]),
        },
        "by_platform": sorted(by_platform.values(), key=lambda r: r["views"], reverse=True),
        "by_pillar": by_pillar,
        "top_posts": [
            {
                "id": p.id,
                "title": p.title,
                "platform": p.platform,
                "pillar": pillar_names.get(p.pillar_id, "未分類"),
                "published_at": p.published_at,
                "views": metrics[p.id].views,
                "engagement": _engagement(metrics[p.id]),
                "engagement_rate": _rate(_engagement(metrics[p.id]), metrics[p.id].views),
                "followers_gained": metrics[p.id].followers_gained,
            }
            for p in top
        ],
        "weekly": [{"week_start": w.date().isoformat(), **weekly[w]} for w in weeks],
        "by_weekday": by_weekday,
    }


# ---------- AI 小編（呼叫主機上的 Codex / Claude CLI） ----------
PLATFORM_GUIDE = {
    "instagram": "Instagram：貼文文案上限約 2,200 字，前兩行要抓住目光，hashtag 5–15 個。",
    "facebook": "Facebook：可以寫長一點、像在說故事，結尾加一個互動提問。",
    "threads": "Threads：單則上限 500 字，口語、短句、像在聊天。",
    "youtube": "YouTube：標題 100 字內，說明欄前 150 字最重要，附上章節時間軸建議。",
    "tiktok": "TikTok：說明欄短而有梗，搭配 3–5 個 hashtag，開頭 3 秒的鉤子最重要。",
    "x": "X (Twitter)：單則 280 字元內，一句話講清楚重點。",
    "blog": "部落格：有標題、小標、段落結構，適合 SEO 的長文。",
    "other": "通用社群平台。",
}

ASSIST_TASKS = {
    "draft": "根據標題與方向，寫一篇可以直接發佈的貼文初稿。只輸出貼文本身。",
    "titles": "提出 5 個吸睛的標題 / 開頭鉤子，每行一個，用數字編號，不要多做解釋。",
    "hashtags": "提出 10–15 個適合的 hashtag，以空格分隔放在同一行，混合大流量與精準小眾標籤。",
    "polish": "潤飾以下貼文：保留原意與作者語氣，讓節奏更順、開頭更抓人、結尾有行動呼籲。只輸出改好的貼文。",
    "ideas": "根據這個主題方向，發想 8 個具體的貼文點子，每行一個：「標題 — 一句話說明切角」。",
}


class AssistIn(BaseModel):
    provider: str  # gpt / claude
    mode: str
    platform: str = "instagram"
    pillar_id: Optional[int] = None
    title: str = ""
    body: str = ""


def build_prompt(body: AssistIn, pillar: Optional[MediaPillar]) -> str:
    lines = [
        "你是專業的自媒體內容企劃與文案。回答一律使用繁體中文（台灣用語），"
        "語氣自然、不浮誇、避免過度使用 emoji。不要使用任何工具，直接回答。",
        "",
        f"平台：{PLATFORM_GUIDE.get(body.platform, PLATFORM_GUIDE['other'])}",
    ]
    if pillar:
        lines.append(f"主題方向：{pillar.name}")
        if pillar.description:
            lines.append(f"方向說明：{pillar.description}")
        if pillar.audience:
            lines.append(f"目標受眾：{pillar.audience}")
        if pillar.tone:
            lines.append(f"語氣風格：{pillar.tone}")
    if body.title.strip():
        lines.append(f"標題 / 主題：{body.title.strip()}")
    if body.body.strip():
        lines.append(f"目前內文：\n{body.body.strip()}")
    lines += ["", f"任務：{ASSIST_TASKS[body.mode]}"]
    return "\n".join(lines)


@router.post("/assist")
def assist(body: AssistIn, session: Session = Depends(get_session)):
    from app import ai_advise

    if body.mode not in ASSIST_TASKS:
        raise HTTPException(status_code=400, detail="不支援的 AI 功能")
    pillar = session.get(MediaPillar, body.pillar_id) if body.pillar_id else None
    if body.mode == "polish" and not body.body.strip():
        raise HTTPException(status_code=400, detail="潤飾需要先有內文")
    if body.mode in ("draft", "titles", "hashtags") and not body.title.strip() and not body.body.strip():
        raise HTTPException(status_code=400, detail="先寫個標題，AI 才知道要寫什麼")
    if body.mode == "ideas" and not pillar and not body.title.strip():
        raise HTTPException(status_code=400, detail="發想點子需要選一個主題方向或寫個標題")
    try:
        answer = ai_advise.ask(body.provider, build_prompt(body, pillar))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "mode": body.mode, "provider": body.provider, "result": answer}
