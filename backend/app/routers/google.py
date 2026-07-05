from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app import google_calendar as gcal
from app.config import settings
from app.database import get_session

router = APIRouter(prefix="/api/google", tags=["google"])


@router.get("/status")
def google_status(session: Session = Depends(get_session)):
    return gcal.status(session)


@router.get("/login")
def google_login():
    if not gcal.is_configured():
        raise HTTPException(status_code=400, detail="Google 尚未設定（缺少 client id / secret）")
    return RedirectResponse(gcal.auth_url())


@router.get("/callback")
def google_callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    session: Session = Depends(get_session),
):
    if error or not code:
        print(f"Google OAuth callback error param: {error!r}")
        return RedirectResponse(f"{settings.frontend_url}/dashboard?google=error")
    try:
        gcal.connect_with_code(session, code)
    except Exception:
        import traceback

        print("Google OAuth token exchange failed:")
        traceback.print_exc()
        return RedirectResponse(f"{settings.frontend_url}/dashboard?google=error")
    return RedirectResponse(f"{settings.frontend_url}/dashboard?google=connected")


@router.post("/sync")
def google_sync(session: Session = Depends(get_session)):
    try:
        return gcal.sync(session)
    except gcal.NotConnected:
        raise HTTPException(status_code=400, detail="尚未連接 Google 日曆")


@router.post("/disconnect")
def google_disconnect(session: Session = Depends(get_session)):
    gcal.disconnect(session)
    return {"ok": True}
