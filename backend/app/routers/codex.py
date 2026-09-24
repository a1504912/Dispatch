"""Codex 用量 API：查用量/額度/Reset，並設定 token 來源。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app import codex_usage
from app.database import get_session
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/codex", tags=["codex"])


@router.get("/usage")
def usage(session: Session = Depends(get_session)):
    try:
        return codex_usage.fetch_usage(session)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    token = get_setting(session, codex_usage.K_TOKEN)
    account = get_setting(session, codex_usage.K_ACCOUNT)
    auth = codex_usage.read_codex_auth()
    return {
        "has_manual_token": bool(token),
        "account_id": account or "",
        "auth_path": codex_usage._auth_path(),
        "auth_found": bool(auth),
    }


class CodexSettingsIn(BaseModel):
    access_token: str = ""
    account_id: str = ""
    clear: bool = False


@router.put("/settings")
def put_settings(payload: CodexSettingsIn, session: Session = Depends(get_session)):
    if payload.clear:  # 清除手動 token，改回讀 ~/.codex/auth.json
        set_setting(session, codex_usage.K_TOKEN, "")
        set_setting(session, codex_usage.K_ACCOUNT, "")
        return {"ok": True, "cleared": True}
    if payload.access_token.strip():
        set_setting(session, codex_usage.K_TOKEN, payload.access_token.strip())
    if payload.account_id.strip():
        set_setting(session, codex_usage.K_ACCOUNT, payload.account_id.strip())
    return {"ok": True}
