from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.database import get_session
from app.models import Pillar, Post, PostStatus
from app.routers.posts import _latest_metrics

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

WEEKDAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]


def _engagement(metric) -> int:
    if not metric:
        return 0
    return metric.likes + metric.comments + metric.shares + metric.saves


def _rate(engagement: int, views: int) -> float:
    return round(engagement / views * 100, 2) if views else 0.0


def _post_date(post: Post) -> datetime:
    return post.published_at or post.scheduled_at or post.created_at


@router.get("/summary")
def summary(
    days: Optional[int] = Query(default=None, ge=1, le=3650),
    session: Session = Depends(get_session),
):
    """Everything the analytics page needs in one call.

    Metrics are taken from each post's latest snapshot. `days` limits the window
    by the post's publish date (falling back to scheduled / created date); the
    weekly trend always covers the last 12 weeks.
    Engagement = likes + comments + shares + saves; rate = engagement / views.
    """
    now = datetime.now()
    all_posts = session.exec(select(Post)).all()
    posts = all_posts
    if days:
        cutoff = now - timedelta(days=days)
        posts = [p for p in all_posts if _post_date(p) >= cutoff]
    pillars = session.exec(select(Pillar).order_by(Pillar.id)).all()
    metrics = _latest_metrics(session, [p.id for p in all_posts])

    # ---- totals ----
    totals = defaultdict(int)
    for post in posts:
        totals[f"status_{post.status.value}"] += 1
        m = metrics.get(post.id)
        if m:
            for key in ("views", "likes", "comments", "shares", "saves", "followers_gained"):
                totals[key] += getattr(m, key)
    engagement_total = totals["likes"] + totals["comments"] + totals["shares"] + totals["saves"]

    # ---- by platform ----
    by_platform: dict[str, dict] = {}
    for post in posts:
        row = by_platform.setdefault(
            post.platform.value,
            {"platform": post.platform.value, "posts": 0, "views": 0, "engagement": 0},
        )
        row["posts"] += 1
        m = metrics.get(post.id)
        row["views"] += m.views if m else 0
        row["engagement"] += _engagement(m)
    for row in by_platform.values():
        row["engagement_rate"] = _rate(row["engagement"], row["views"])

    # ---- by pillar: planned mix vs actual mix ----
    # The mix counts committed content (draft / scheduled / published), not raw ideas.
    committed = [p for p in posts if p.status != PostStatus.idea]
    pillar_rows = []
    groups: list[tuple[Optional[Pillar], list[Post]]] = [
        (pillar, [p for p in committed if p.pillar_id == pillar.id]) for pillar in pillars
    ]
    unassigned = [p for p in committed if p.pillar_id is None]
    if unassigned:
        groups.append((None, unassigned))
    for pillar, group in groups:
        views = sum(metrics[p.id].views for p in group if p.id in metrics)
        engagement = sum(_engagement(metrics.get(p.id)) for p in group)
        pillar_rows.append(
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

    # ---- top posts ----
    measured = [p for p in posts if p.id in metrics]
    top_posts = sorted(measured, key=lambda p: metrics[p.id].views, reverse=True)[:10]
    pillar_names = {p.id: p.name for p in pillars}

    # ---- weekly trend (published posts, always the last 12 weeks) ----
    this_monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    weeks = [this_monday - timedelta(weeks=i) for i in range(11, -1, -1)]
    weekly = {w: {"posts": 0, "views": 0, "engagement": 0} for w in weeks}
    for post in all_posts:
        if post.status != PostStatus.published or not post.published_at:
            continue
        m = metrics.get(post.id)
        published = post.published_at
        week = (published - timedelta(days=published.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        if week in weekly:
            weekly[week]["posts"] += 1
            weekly[week]["views"] += m.views if m else 0
            weekly[week]["engagement"] += _engagement(m)

    # ---- by weekday (published posts in the window) ----
    by_weekday = [{"weekday": d, "posts": 0, "views": 0, "engagement": 0} for d in WEEKDAYS]
    for post in posts:
        if post.status != PostStatus.published or not post.published_at:
            continue
        m = metrics.get(post.id)
        published = post.published_at
        if m:
            day = by_weekday[published.weekday()]
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
        "by_pillar": pillar_rows,
        "top_posts": [
            {
                "id": p.id,
                "title": p.title,
                "platform": p.platform.value,
                "pillar": pillar_names.get(p.pillar_id, "未分類"),
                "published_at": p.published_at,
                "views": metrics[p.id].views,
                "engagement": _engagement(metrics[p.id]),
                "engagement_rate": _rate(_engagement(metrics[p.id]), metrics[p.id].views),
                "followers_gained": metrics[p.id].followers_gained,
            }
            for p in top_posts
        ],
        "weekly": [
            {"week_start": w.date().isoformat(), **weekly[w]} for w in weeks
        ],
        "by_weekday": by_weekday,
    }
