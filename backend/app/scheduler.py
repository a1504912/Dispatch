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
from app.models import Event, SentNotification

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
    """清掉 7 天前的去重標記，避免資料表無限長大。"""
    cutoff = datetime.utcnow() - timedelta(days=7)
    for row in session.exec(
        select(SentNotification).where(SentNotification.created_at < cutoff)
    ).all():
        session.delete(row)
    session.commit()


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


def _tick() -> None:
    now = _now_local()
    with Session(engine) as session:
        try:
            _check_event_reminders(session, now)
            _check_daily_summary(session, now)
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
