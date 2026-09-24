"""Codex（ChatGPT）用量查詢。

抓 OpenAI Codex 的用量／額度／Reset 狀態，資料來源是 Codex CLI 也在用的端點：
    GET https://chatgpt.com/backend-api/wham/usage
需要 ChatGPT 的 access token；優先讀主機上的 Codex 登入檔 ~/.codex/auth.json
（tokens.access_token / tokens.account_id），或使用者在設定頁手動貼的 token。

Token 只存在自架主機（登入檔或本機資料庫 Setting 表），不會上傳、不進 git。
"""

import base64
import json
import os
import time
from pathlib import Path

import httpx

USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"

K_TOKEN = "codex_access_token"  # 手動貼的 access token（覆寫）
K_ACCOUNT = "codex_account_id"  # 手動貼的 ChatGPT-Account-Id（可空，會嘗試從 token 推得）


def _auth_path() -> str:
    return os.environ.get("CODEX_AUTH_PATH") or str(Path.home() / ".codex" / "auth.json")


def read_codex_auth() -> dict | None:
    """讀 Codex CLI 登入檔；讀不到回 None。"""
    try:
        with open(_auth_path(), encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return None


def _decode_jwt_claims(token: str) -> dict:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:  # noqa: BLE001
        return {}


def _account_id_from_token(token: str) -> str | None:
    claims = _decode_jwt_claims(token or "")
    auth = claims.get("https://api.openai.com/auth") or {}
    return (
        auth.get("chatgpt_account_id")
        or claims.get("chatgpt_account_id")
        or claims.get("account_id")
    )


def get_credentials(session) -> tuple[str | None, str | None, str | None]:
    """回傳 (access_token, account_id, 來源)。先看設定頁手動 token，再讀 ~/.codex/auth.json。"""
    from app.push import get_setting

    token = (get_setting(session, K_TOKEN) or "").strip()
    account = (get_setting(session, K_ACCOUNT) or "").strip()
    if token:
        return token, (account or _account_id_from_token(token)), "manual"

    data = read_codex_auth()
    if data:
        tokens = data.get("tokens") or {}
        token = tokens.get("access_token")
        if token:
            account = tokens.get("account_id") or _account_id_from_token(token)
            return token, account, "codex-cli"
    return None, None, None


def _window(w: dict | None) -> dict | None:
    if not isinstance(w, dict):
        return None
    return {
        "used_percent": w.get("used_percent"),
        "window_seconds": w.get("limit_window_seconds"),
        "reset_at": w.get("reset_at"),
        "reset_after_seconds": w.get("reset_after_seconds"),
    }


def _normalize(data: dict, source: str) -> dict:
    rl = data.get("rate_limit") or {}
    return {
        "plan_type": data.get("plan_type"),
        "allowed": rl.get("allowed"),
        "limit_reached": rl.get("limit_reached"),
        "primary": _window(rl.get("primary_window")),
        "secondary": _window(rl.get("secondary_window")),
        "credits": data.get("credits"),
        "source": source,
        "fetched_at": int(time.time()),
    }


def fetch_usage(session) -> dict:
    token, account, source = get_credentials(session)
    if not token:
        raise RuntimeError(
            "找不到 Codex 憑證：主機沒有 ~/.codex/auth.json，也還沒在設定頁貼 token。"
        )
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "codex-cli",
        "Accept": "application/json",
    }
    if account:
        headers["ChatGPT-Account-Id"] = account
    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        resp = client.get(USAGE_URL, headers=headers)
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "Codex token 已過期或無效：請在主機重新登入 Codex（會更新 auth.json），"
            "或到設定頁重貼新的 token。"
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code}: {(resp.text or '')[:200]}")
    return _normalize(resp.json(), source)
