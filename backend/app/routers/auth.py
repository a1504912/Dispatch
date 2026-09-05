import hashlib
import hmac
from typing import Optional

from fastapi import APIRouter, HTTPException
from sqlmodel import SQLModel

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


def expected_token() -> str:
    """由密碼推導出的固定 token（改密碼即讓所有舊 token 失效）。"""
    return hashlib.sha256(f"dispatch-auth:{settings.auth_password}".encode()).hexdigest()


def verify_token(token: Optional[str]) -> bool:
    if not settings.auth_password:
        return True
    if not token:
        return False
    return hmac.compare_digest(token, expected_token())


class LoginRequest(SQLModel):
    password: str


@router.get("/status")
def auth_status():
    return {"auth_required": bool(settings.auth_password)}


@router.post("/login")
def login(payload: LoginRequest):
    if not settings.auth_password:
        return {"token": ""}
    if not hmac.compare_digest(payload.password, settings.auth_password):
        raise HTTPException(status_code=401, detail="密碼錯誤")
    return {"token": expected_token()}
