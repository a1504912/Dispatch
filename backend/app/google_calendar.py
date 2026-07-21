"""Two-way Google Calendar sync using plain httpx (no heavy Google SDKs).

Design (predictable, avoids clobbering):
- Sync PULL: create new local events from Google, and update events already
  linked by google_event_id. Cancelled Google events delete their local copy.
- Sync PUSH: create Google events for local events that have no google_event_id.
- Live propagation: when a linked local event is edited/deleted in Dispatch,
  push that change to Google immediately (see events router). Because Dispatch
  edits are pushed right away, a later PULL just sees the same values back, so
  the two sides stay consistent.
"""

import datetime as dt
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx
from sqlmodel import Session, select

from app.config import settings
from app.models import Event, GoogleCredential

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"
CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
SCOPES = "openid email https://www.googleapis.com/auth/calendar"
GOOGLE_COLOR = "#4285F4"

PULL_PAST_DAYS = 30
PULL_FUTURE_DAYS = 365


class NotConnected(Exception):
    pass


# ---------- config / OAuth ----------
def is_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def auth_url() -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"{AUTH_URI}?{urlencode(params)}"


def _tz() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def exchange_code(code: str) -> dict:
    data = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=20) as client:
        resp = client.post(TOKEN_URI, data=data)
        if resp.status_code != 200:
            # Google 會在 body 裡說明原因（invalid_client / redirect_uri_mismatch…）
            print("Google token endpoint replied:", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()


def _userinfo(access_token: str) -> dict:
    with httpx.Client(timeout=20) as client:
        resp = client.get(USERINFO_URI, headers={"Authorization": f"Bearer {access_token}"})
        return resp.json() if resp.status_code == 200 else {}


def _save_tokens(session: Session, token_resp: dict, *, keep_refresh=None, email=None) -> GoogleCredential:
    row = session.get(GoogleCredential, 1) or GoogleCredential(id=1)
    row.access_token = token_resp["access_token"]
    if token_resp.get("refresh_token"):
        row.refresh_token = token_resp["refresh_token"]
    elif keep_refresh:
        row.refresh_token = keep_refresh
    row.expiry = dt.datetime.utcnow() + dt.timedelta(seconds=token_resp.get("expires_in", 3600))
    if email is not None:
        row.email = email
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def connect_with_code(session: Session, code: str) -> None:
    token_resp = exchange_code(code)
    info = _userinfo(token_resp["access_token"])
    _save_tokens(session, token_resp, email=info.get("email", ""))


def connected(session: Session) -> bool:
    row = session.get(GoogleCredential, 1)
    return bool(row and row.access_token)


def status(session: Session) -> dict:
    row = session.get(GoogleCredential, 1)
    return {
        "configured": is_configured(),
        "connected": bool(row and row.access_token),
        "email": row.email if row else "",
    }


def disconnect(session: Session) -> None:
    row = session.get(GoogleCredential, 1)
    if row:
        session.delete(row)
        session.commit()


def _access_token(session: Session) -> str:
    row = session.get(GoogleCredential, 1)
    if not row or not row.access_token:
        raise NotConnected()
    # 快過期就用 refresh token 換新的
    if row.expiry and dt.datetime.utcnow() >= row.expiry - dt.timedelta(seconds=60):
        if not row.refresh_token:
            raise NotConnected()
        data = {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": row.refresh_token,
            "grant_type": "refresh_token",
        }
        with httpx.Client(timeout=20) as client:
            resp = client.post(TOKEN_URI, data=data)
            resp.raise_for_status()
            row = _save_tokens(session, resp.json(), keep_refresh=row.refresh_token, email=row.email)
    return row.access_token


# ---------- mapping ----------
def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _to_google_body(event: Event) -> dict:
    body = {"summary": event.title, "description": event.description or ""}
    if event.all_day:
        start_date = event.start_time.date()
        # Google 的整天活動 end.date 是「不含」的隔天
        end_date = max(event.end_time.date(), start_date + dt.timedelta(days=1))
        body["start"] = {"date": start_date.isoformat()}
        body["end"] = {"date": end_date.isoformat()}
        return body
    tz = _tz()
    start = event.start_time.replace(tzinfo=tz)
    end = event.end_time.replace(tzinfo=tz)
    body["start"] = {"dateTime": start.isoformat(), "timeZone": settings.timezone}
    body["end"] = {"dateTime": end.isoformat(), "timeZone": settings.timezone}
    return body


def _parse_node(node: dict) -> dt.datetime:
    tz = _tz()
    if node.get("dateTime"):
        d = dt.datetime.fromisoformat(node["dateTime"])
        if d.tzinfo:
            d = d.astimezone(tz)
        return d.replace(tzinfo=None)
    # all-day event ("date": "YYYY-MM-DD")
    return dt.datetime.fromisoformat(node["date"])


# ---------- live propagation (best-effort, called from events router) ----------
def push_event(session: Session, event: Event) -> None:
    """Create or update one event on Google and store its id."""
    token = _access_token(session)
    body = _to_google_body(event)
    with httpx.Client(timeout=20) as client:
        if event.google_event_id:
            resp = client.put(
                f"{CAL_BASE}/{event.google_event_id}", headers=_headers(token), json=body
            )
            if resp.status_code in (404, 410):  # 已不存在 → 重建
                resp = client.post(CAL_BASE, headers=_headers(token), json=body)
        else:
            resp = client.post(CAL_BASE, headers=_headers(token), json=body)
        resp.raise_for_status()
        gid = resp.json().get("id")
    if gid and gid != event.google_event_id:
        event.google_event_id = gid
        session.add(event)
        session.commit()


def delete_event(session: Session, google_event_id: str) -> None:
    token = _access_token(session)
    with httpx.Client(timeout=20) as client:
        resp = client.delete(f"{CAL_BASE}/{google_event_id}", headers=_headers(token))
        if resp.status_code not in (200, 204, 404, 410):
            resp.raise_for_status()


# ---------- full sync ----------
def sync(session: Session) -> dict:
    token = _access_token(session)
    tz = _tz()
    now = dt.datetime.now(tz)
    time_min = (now - dt.timedelta(days=PULL_PAST_DAYS)).isoformat()
    time_max = (now + dt.timedelta(days=PULL_FUTURE_DAYS)).isoformat()

    pulled_created = pulled_updated = deleted_local = pushed = 0

    with httpx.Client(timeout=30) as client:
        # ----- PULL -----
        page_token = None
        while True:
            params = {
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": "250",
                "showDeleted": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            resp = client.get(CAL_BASE, headers=_headers(token), params=params)
            resp.raise_for_status()
            data = resp.json()

            for g in data.get("items", []):
                gid = g.get("id")
                if not gid:
                    continue
                local = session.exec(
                    select(Event).where(Event.google_event_id == gid)
                ).first()
                if g.get("status") == "cancelled":
                    if local:
                        session.delete(local)
                        deleted_local += 1
                    continue
                start_node, end_node = g.get("start") or {}, g.get("end") or {}
                if not start_node or not end_node:
                    continue
                start, end = _parse_node(start_node), _parse_node(end_node)
                all_day = bool(start_node.get("date"))
                title = g.get("summary") or "(無標題)"
                desc = g.get("description") or ""
                if local:
                    local.title, local.start_time, local.end_time = title, start, end
                    local.description, local.all_day = desc, all_day
                    session.add(local)
                    pulled_updated += 1
                else:
                    session.add(
                        Event(
                            title=title,
                            start_time=start,
                            end_time=end,
                            description=desc,
                            color=GOOGLE_COLOR,
                            all_day=all_day,
                            google_event_id=gid,
                            source="google",
                        )
                    )
                    pulled_created += 1
            session.commit()
            page_token = data.get("nextPageToken")
            if not page_token:
                break

        # ----- PUSH new local-only events (待辦事項不推) -----
        to_push = session.exec(
            select(Event).where(
                Event.google_event_id == None,  # noqa: E711
                Event.is_task == False,  # noqa: E712
            )
        ).all()
        for ev in to_push:
            resp = client.post(CAL_BASE, headers=_headers(token), json=_to_google_body(ev))
            resp.raise_for_status()
            ev.google_event_id = resp.json().get("id")
            session.add(ev)
            pushed += 1
        session.commit()

    return {
        "pulled_created": pulled_created,
        "pulled_updated": pulled_updated,
        "deleted_local": deleted_local,
        "pushed": pushed,
    }
