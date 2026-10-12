"""Seed example content pillars, and optionally demo posts with metrics.

Pillars are matched by name, so re-running only creates the missing ones.
Demo posts are only created with --demo, and only when there are no posts yet,
so it never mixes fake numbers into real data.

Usage (from backend/):
    python -m app.seed_content          # pillars only
    python -m app.seed_content --demo   # pillars + 24 demo posts with metrics
"""

import random
import sys
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Pillar, Platform, Post, PostMetric, PostStatus

DEFAULT_PILLARS = [
    Pillar(
        name="知識分享",
        description="把自己會的東西拆成好懂的小知識，建立專業感",
        audience="想學新技能的上班族",
        tone="清楚、有條理、帶一點幽默",
        color="#2a78d6",
        target_ratio=40,
    ),
    Pillar(
        name="生活日常",
        description="真實的日常與想法，讓粉絲認識你這個人",
        audience="已追蹤的粉絲",
        tone="輕鬆、真誠、像朋友聊天",
        color="#eb6834",
        target_ratio=30,
    ),
    Pillar(
        name="經驗心得",
        description="踩過的坑與學到的事，引發共鳴與討論",
        audience="處境相似的同溫層",
        tone="誠實、有溫度",
        color="#1baf7a",
        target_ratio=20,
    ),
    Pillar(
        name="互動活動",
        description="問答、投票、抽獎，拉高互動與觸及",
        audience="所有粉絲",
        tone="熱情、有號召力",
        color="#eda100",
        target_ratio=10,
    ),
]

DEMO_TITLES = [
    "新手也能懂的 3 個效率工具",
    "我的週末早晨 routine",
    "第一份工作學到最重要的一件事",
    "留言告訴我你最想學什麼",
    "5 分鐘整理好你的桌面",
    "最近在讀的一本書",
    "失敗了三次才成功的提案",
    "限時抽獎：送出 3 本好書",
    "簡報不卡關的 4 個秘訣",
    "咖啡廳工作一日",
    "轉職前我希望有人告訴我的事",
    "投票：下一集要聊什麼？",
]


def seed_pillars(session: Session) -> list[Pillar]:
    for pillar in DEFAULT_PILLARS:
        exists = session.exec(select(Pillar).where(Pillar.name == pillar.name)).first()
        if exists:
            print(f"skip   {pillar.name}（已存在）")
            continue
        session.add(pillar)
        print(f"create {pillar.name}（目標 {pillar.target_ratio}%）")
    session.commit()
    return session.exec(select(Pillar).order_by(Pillar.id)).all()


def seed_demo_posts(session: Session, pillars: list[Pillar]) -> None:
    if session.exec(select(Post)).first():
        print("已有貼文，跳過 demo 資料")
        return

    rng = random.Random(42)
    now = datetime.now().replace(second=0, microsecond=0)
    platforms = [Platform.instagram, Platform.threads, Platform.facebook, Platform.youtube]
    for i in range(24):
        pillar = pillars[i % len(pillars)]
        platform = platforms[rng.randrange(len(platforms))]
        if i < 18:
            status = PostStatus.published
            when = now - timedelta(days=rng.randint(1, 80), hours=rng.randint(0, 12))
        elif i < 21:
            status = PostStatus.scheduled
            when = now + timedelta(days=rng.randint(1, 10), hours=rng.randint(0, 12))
        else:
            status = PostStatus.draft
            when = None
        post = Post(
            title=DEMO_TITLES[i % len(DEMO_TITLES)],
            body="（示範內容）",
            platform=platform,
            status=status,
            pillar_id=pillar.id,
            tags="demo",
            scheduled_at=when,
            published_at=when if status == PostStatus.published else None,
        )
        session.add(post)
        session.commit()
        session.refresh(post)

        if status == PostStatus.published:
            views = rng.randint(300, 6000)
            session.add(
                PostMetric(
                    post_id=post.id,
                    recorded_at=when + timedelta(days=2),
                    views=views,
                    likes=int(views * rng.uniform(0.02, 0.09)),
                    comments=int(views * rng.uniform(0.002, 0.015)),
                    shares=int(views * rng.uniform(0.001, 0.01)),
                    saves=int(views * rng.uniform(0.003, 0.03)),
                    followers_gained=rng.randint(0, 40),
                )
            )
    session.commit()
    print("完成：新增 24 篇 demo 貼文（18 已發佈 / 3 已排程 / 3 草稿）")


def main(argv: list[str]) -> None:
    init_db()
    with Session(engine) as session:
        pillars = seed_pillars(session)
        if "--demo" in argv:
            seed_demo_posts(session, pillars)


if __name__ == "__main__":
    main(sys.argv[1:])
