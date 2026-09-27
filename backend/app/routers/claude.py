"""Claude 用量 API：查用量/Reset，並設定 token 來源。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app import claude_usage
from app.database import get_session
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/claude", tags=["claude"])


@router.get("/usage")
def usage(debug: int = 0, session: Session = Depends(get_session)):
    try:
        return claude_usage.fetch_usage(session, debug=bool(debug))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    token = get_setting(session, claude_usage.K_TOKEN)
    creds = claude_usage.read_claude_creds()
    return {
        "has_manual_token": bool(token),
        "creds_path": claude_usage._creds_path(),
        "creds_found": bool(creds),
    }


class ClaudeSettingsIn(BaseModel):
    access_token: str = ""
    clear: bool = False


@router.put("/settings")
def put_settings(payload: ClaudeSettingsIn, session: Session = Depends(get_session)):
    if payload.clear:
        set_setting(session, claude_usage.K_TOKEN, "")
        return {"ok": True, "cleared": True}
    if payload.access_token.strip():
        set_setting(session, claude_usage.K_TOKEN, payload.access_token.strip())
    return {"ok": True}
