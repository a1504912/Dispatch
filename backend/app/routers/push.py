from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlmodel import Session

from app import push
from app.database import get_session

router = APIRouter(prefix="/api/push", tags=["push"])


class SubscribePayload(BaseModel):
    subscription: dict


class UnsubscribePayload(BaseModel):
    endpoint: str


class NotifySettings(BaseModel):
    remind_before_minutes: int = 10
    daily_summary_time: str = "08:00"  # 空字串 = 關閉每日摘要


@router.get("/public-key")
def public_key(session: Session = Depends(get_session)):
    public, _ = push.get_vapid_keys(session)
    return {"key": public}


@router.post("/subscribe")
def subscribe(
    payload: SubscribePayload, request: Request, session: Session = Depends(get_session)
):
    ua = request.headers.get("user-agent", "")
    push.save_subscription(session, payload.subscription, ua)
    return {"ok": True, "devices": push.subscription_count(session)}


@router.post("/unsubscribe")
def unsubscribe(payload: UnsubscribePayload, session: Session = Depends(get_session)):
    push.delete_subscription(session, payload.endpoint)
    return {"ok": True, "devices": push.subscription_count(session)}


@router.post("/test")
def test(session: Session = Depends(get_session)):
    sent = push.send_to_all(
        session,
        {
            "title": "🔔 Dispatch 測試通知",
            "body": "太好了，你的裝置可以收到通知了！",
            "url": "/dashboard",
            "tag": "test",
        },
    )
    return {"ok": True, "sent": sent, "devices": push.subscription_count(session)}


@router.get("/settings", response_model=NotifySettings)
def get_settings(session: Session = Depends(get_session)):
    try:
        minutes = int(push.get_setting(session, "remind_before_minutes", "10"))
    except ValueError:
        minutes = 10
    return NotifySettings(
        remind_before_minutes=minutes,
        daily_summary_time=push.get_setting(session, "daily_summary_time", "08:00"),
    )


@router.put("/settings", response_model=NotifySettings)
def update_settings(payload: NotifySettings, session: Session = Depends(get_session)):
    minutes = max(0, min(1440, payload.remind_before_minutes))
    push.set_setting(session, "remind_before_minutes", str(minutes))
    push.set_setting(session, "daily_summary_time", (payload.daily_summary_time or "").strip())
    return get_settings(session)
