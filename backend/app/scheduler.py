"""背景排程：每分鐘檢查行程，到點就送 Web Push 通知。

在自架主機（一直開著）上跑，所以就算網頁沒開、瀏覽器關了，也會推播。
用一個 daemon 執行緒，避免卡住 FastAPI 主事件迴圈。
"""

import threading
from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app import push
from app.config import settings
from app.database import engine
from app.models import Budget, Event, SentNotification, Transaction

_stop = threading.Event()
_thread: threading.Thread | None = None


def _now_local() -> datetime:
    """主機當地（設定時區）的當下時間，naive（行程 start_time 也是 naive 當地時間）。"""
    return datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None)


def _already_sent(session: Session, tag: str) -> bool:
    return session.get(SentNotification, tag) is not None


def _mark_sent(session: Session, tag: str) -> None:
    session.add(SentNotification(tag=tag))
    session.commit()


def _prune(session: Session) -> None:
    """清掉 7 天前的去重標記，避免資料表無限長大（免費遊戲的標記保留，以免重複提醒）。"""
    cutoff = datetime.utcnow() - timedelta(days=7)
    for row in session.exec(
        select(SentNotification).where(SentNotification.created_at < cutoff)
    ).all():
        if row.tag.startswith("game:"):
            continue
        session.delete(row)
    session.commit()


def _check_new_free_games(session: Session, now: datetime) -> None:
    """定時抓免費遊戲，發現沒看過的就推播（每半點檢查一次，配合 30 分快取）。"""
    if now.minute not in (0, 30):
        return
    from app.routers import games as games_mod

    try:
        games = games_mod.fetch_games_sync()
    except Exception:  # noqa: BLE001
        return
    if not games:
        return

    first_run = session.get(SentNotification, "game:init") is None
    new_games = []
    for g in games:
        gid = g.get("id")
        if gid is None:
            continue
        if _already_sent(session, f"game:{gid}"):
            continue
        new_games.append(g)

    # 第一次跑：把現有全部標記為已知（建立基準），不推播，避免一次灌爆
    if first_run:
        for g in games:
            gid = g.get("id")
            if gid is not None:
                _mark_sent(session, f"game:{gid}")
        _mark_sent(session, "game:init")
        return

    if not new_games:
        return
    for g in new_games:
        _mark_sent(session, f"game:{g['id']}")

    titles = "、".join(g.get("title", "") for g in new_games[:3])
    more = f" 等 {len(new_games)} 款" if len(new_games) > 3 else ""
    push.send_to_all(
        session,
        {
            "title": "🎮 新的免費遊戲！",
            "body": f"{titles}{more} 現在可以免費領取",
            "url": "/games",
            "tag": f"games:{now.strftime('%Y%m%d%H%M')}",
        },
    )


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _check_event_reminders(session: Session, now: datetime) -> None:
    try:
        remind_before = int(push.get_setting(session, "remind_before_minutes", "10"))
    except ValueError:
        remind_before = 10

    events = session.exec(
        select(Event).where(
            Event.completed == False,  # noqa: E712
            Event.is_task == False,  # noqa: E712
            Event.all_day == False,  # noqa: E712
        )
    ).all()

    for ev in events:
        if ev.start_time is None:
            continue
        reminder_at = ev.start_time - timedelta(minutes=remind_before)
        # 視窗：到了提醒時間、且行程還沒過太久（避免主機剛開機時狂補舊通知）
        if not (reminder_at <= now < ev.start_time + timedelta(minutes=2)):
            continue
        tag = f"ev:{ev.id}:{ev.start_time.isoformat()}"
        if _already_sent(session, tag):
            continue

        when = _fmt_time(ev.start_time)
        if remind_before > 0 and now < ev.start_time:
            body = f"{when} 開始（還有 {remind_before} 分鐘）"
        else:
            body = f"{when} 開始"
        if ev.description:
            snippet = ev.description.strip().splitlines()[0][:40]
            if snippet:
                body += f"\n{snippet}"

        push.send_to_all(session, {"title": f"⏰ {ev.title}", "body": body, "url": "/dashboard", "tag": tag})
        _mark_sent(session, tag)


def _check_daily_summary(session: Session, now: datetime) -> None:
    raw = push.get_setting(session, "daily_summary_time", "08:00").strip()
    if not raw:
        return
    try:
        hh, mm = (int(x) for x in raw.split(":"))
        target = dtime(hour=hh, minute=mm)
    except (ValueError, TypeError):
        return

    today = now.date()
    tag = f"daily:{today.isoformat()}"
    if now.time() < target or _already_sent(session, tag):
        return

    events = session.exec(
        select(Event).where(
            Event.completed == False,  # noqa: E712
            Event.is_task == False,  # noqa: E712
        )
    ).all()
    today_count = sum(1 for e in events if e.start_time and e.start_time.date() == today)
    overdue = sum(1 for e in events if e.start_time and e.start_time.date() < today)
    todos = len(
        session.exec(
            select(Event).where(
                Event.completed == False,  # noqa: E712
                Event.is_task == True,  # noqa: E712
            )
        ).all()
    )

    # 標記已送（就算內容為空也標記，才不會這一天一直重試）
    _mark_sent(session, tag)
    if today_count or overdue or todos:
        parts = [f"今天 {today_count} 件行程"]
        if overdue:
            parts.append(f"逾期 {overdue} 件")
        if todos:
            parts.append(f"待辦 {todos} 件")
        body = "・".join(parts)
        push.send_to_all(
            session, {"title": "☀️ 今日摘要", "body": body, "url": "/dashboard", "tag": tag}
        )


def _check_budget_overspend(session: Session, now: datetime) -> None:
    """本月支出超過預算就推播（總預算 + 各分類；每月每項只提醒一次）。"""
    budgets = session.exec(select(Budget)).all()
    if not budgets:
        return
    ym = f"{now.year:04d}{now.month:02d}"
    # 本月支出：總額 + 各分類
    txs = session.exec(
        select(Transaction).where(Transaction.kind == "expense")
    ).all()
    total = 0.0
    by_cat: dict[str, float] = {}
    for t in txs:
        if t.date and t.date.year == now.year and t.date.month == now.month:
            total += t.amount
            by_cat[t.category] = by_cat.get(t.category, 0) + t.amount

    for b in budgets:
        if b.amount <= 0:
            continue
        spent = total if b.category == "" else by_cat.get(b.category, 0)
        if spent <= b.amount:
            continue
        tag = f"budget:{b.category or 'overall'}:{ym}"
        if _already_sent(session, tag):
            continue
        label = "本月總支出" if b.category == "" else f"「{b.category}」"
        over = int(spent - b.amount)
        push.send_to_all(
            session,
            {
                "title": "💸 預算超支提醒",
                "body": f"{label}已超出預算 ${over:,}（{int(spent):,}/{int(b.amount):,}）",
                "url": "/ledger",
                "tag": tag,
            },
        )
        _mark_sent(session, tag)


def _tick() -> None:
    now = _now_local()
    with Session(engine) as session:
        try:
            _check_event_reminders(session, now)
            _check_daily_summary(session, now)
            _check_budget_overspend(session, now)
            _check_new_free_games(session, now)
            if now.minute == 0:  # 每小時整點清一次舊標記
                _prune(session)
        except Exception as exc:  # noqa: BLE001
            print("scheduler tick error:", str(exc)[:200])


def _run() -> None:
    while not _stop.is_set():
        _tick()
        # 每 5 秒檢查一次停止旗標，最多睡 60 秒
        for _ in range(12):
            if _stop.wait(5):
                return


def start() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_run, name="dispatch-scheduler", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
