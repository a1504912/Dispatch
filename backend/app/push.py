"""Web Push（瀏覽器/手機推播）核心：VAPID 金鑰、訂閱、發送、通知偏好。

發送用 pywebpush；私鑰以「raw base64url（32 bytes）」格式存 DB，
pywebpush 的 webpush(vapid_private_key=<raw字串>) 可直接使用。
"""

import base64
import json
from typing import Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush
from sqlmodel import Session, select

from app.config import settings
from app.models import PushSubscription, Setting


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# ---- 通用 key-value 設定 ---------------------------------------------------

def get_setting(session: Session, key: str, default: str = "") -> str:
    row = session.get(Setting, key)
    return row.value if row else default


def set_setting(session: Session, key: str, value: str) -> None:
    row = session.get(Setting, key)
    if row:
        row.value = value
    else:
        row = Setting(key=key, value=value)
    session.add(row)
    session.commit()


# ---- VAPID 金鑰（第一次呼叫時自動產生並存起來）-----------------------------

def get_vapid_keys(session: Session) -> tuple[str, str]:
    """回傳 (public_application_server_key, private_raw_base64url)。不存在就產生。"""
    public = get_setting(session, "vapid_public")
    private = get_setting(session, "vapid_private")
    if public and private:
        return public, private

    priv = ec.generate_private_key(ec.SECP256R1())
    private_value = priv.private_numbers().private_value.to_bytes(32, "big")
    private_raw = _b64url(private_value)
    raw_pub = priv.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    public = _b64url(raw_pub)
    set_setting(session, "vapid_public", public)
    set_setting(session, "vapid_private", private_raw)
    return public, private_raw


def _vapid_claims() -> dict:
    return {"sub": "mailto:dispatch@example.com"}


# ---- 訂閱管理 --------------------------------------------------------------

def save_subscription(session: Session, sub: dict, ua: str = "") -> PushSubscription:
    endpoint = sub.get("endpoint", "")
    keys = sub.get("keys", {}) or {}
    existing = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    ).first()
    if existing:
        existing.p256dh = keys.get("p256dh", "")
        existing.auth = keys.get("auth", "")
        existing.ua = ua
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    row = PushSubscription(
        endpoint=endpoint,
        p256dh=keys.get("p256dh", ""),
        auth=keys.get("auth", ""),
        ua=ua,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_subscription(session: Session, endpoint: str) -> None:
    row = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    ).first()
    if row:
        session.delete(row)
        session.commit()


# ---- 發送 ------------------------------------------------------------------

def _send_one(session: Session, sub: PushSubscription, payload: dict, private_raw: str) -> bool:
    info = {
        "endpoint": sub.endpoint,
        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
    }
    try:
        webpush(
            subscription_info=info,
            data=json.dumps(payload),
            vapid_private_key=private_raw,
            vapid_claims=_vapid_claims(),
            timeout=10,
        )
        return True
    except WebPushException as exc:  # noqa: BLE001
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            # 訂閱已失效（使用者關通知/換裝置）→ 清掉
            session.delete(sub)
            session.commit()
        else:
            print("web push failed:", str(exc)[:200])
        return False
    except Exception as exc:  # noqa: BLE001
        print("web push error:", str(exc)[:200])
        return False


def send_to_all(session: Session, payload: dict) -> int:
    """對所有訂閱裝置發送同一則通知，回傳成功數。"""
    _, private_raw = get_vapid_keys(session)
    subs = session.exec(select(PushSubscription)).all()
    sent = 0
    for sub in subs:
        if _send_one(session, sub, payload, private_raw):
            sent += 1
    return sent


def subscription_count(session: Session) -> int:
    return len(session.exec(select(PushSubscription)).all())
