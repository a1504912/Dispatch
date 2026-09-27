"""Claude Code（Anthropic）用量查詢。

抓 Claude 訂閱方案的用量／Reset 狀態，資料來源是 Claude Code 也在用的端點：
    GET https://api.anthropic.com/api/oauth/usage
需要 Claude Code 的 OAuth access token；優先讀主機上的登入檔
~/.claude/.credentials.json（claudeAiOauth.accessToken），或設定頁手動貼的 token。

這支端點限流很兇（大約每分鐘只能問一次），所以這裡加了 ~45 秒的記憶體快取，
並在被限流(429)時回傳上次的結果標記為 stale。

Token 只存在自架主機（登入檔或本機 Setting 表），不會上傳、不進 git。
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path

import httpx

USAGE_URL = "https://api.anthropic.com/api/oauth/usage"

K_TOKEN = "claude_access_token"

_WINDOWS = [
    ("five_hour", "5 小時"),
    ("seven_day", "每週"),
    ("seven_day_opus", "每週 Opus"),
    ("seven_day_sonnet", "每週 Sonnet"),
]

# 簡單記憶體快取：避免頻繁打端點被限流
_CACHE: dict = {"data": None, "at": 0.0}
_CACHE_TTL = 45.0


def _creds_path() -> str:
    return os.environ.get("CLAUDE_CREDS_PATH") or str(Path.home() / ".claude" / ".credentials.json")


def read_claude_creds() -> dict | None:
    try:
        with open(_creds_path(), "rb") as f:
            return json.loads(f.read().decode("utf-8-sig", errors="replace"))
    except Exception:  # noqa: BLE001
        return None


def get_credentials(session) -> tuple[str | None, str | None]:
    """回傳 (access_token, 來源)。先看設定頁手動 token，再讀 ~/.claude/.credentials.json。"""
    from app.push import get_setting

    token = (get_setting(session, K_TOKEN) or "").strip()
    if token:
        return token, "manual"
    data = read_claude_creds()
    if data:
        oauth = data.get("claudeAiOauth") or {}
        token = oauth.get("accessToken")
        if token:
            return token, "claude-cli"
    return None, None


def _parse_reset(v):
    """resets_at 可能是 RFC3339 字串或 epoch（秒/毫秒）→ 統一回毫秒。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v * 1000) if v < 1e11 else int(v)
    try:
        return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        return None


def _one_window(key: str, label: str, w: dict) -> dict | None:
    u = w.get("utilization")
    if u is None:
        u = w.get("used_percent")
    pct = None
    if u is not None:
        try:
            u = float(u)
            pct = round(u * 100, 1) if u <= 1 else round(u, 1)
        except (TypeError, ValueError):
            pct = None
    return {
        "key": key,
        "label": label,
        "used_percent": pct,
        "resets_at": _parse_reset(w.get("resets_at") or w.get("reset_at")),
    }


def _extract(data: dict) -> list[dict]:
    out = []
    for key, label in _WINDOWS:
        w = data.get(key)
        if isinstance(w, dict):
            out.append(_one_window(key, label, w))
    return out


def _find_windows(data: dict) -> list[dict]:
    ws = _extract(data)
    if ws:
        return ws
    for v in data.values():  # 有可能包在某一層底下
        if isinstance(v, dict):
            ws = _extract(v)
            if ws:
                return ws
    return []


def fetch_usage(session, debug: bool = False) -> dict:
    # 45 秒內剛查過就直接回快取，避免頻繁打端點被限流
    if not debug and _CACHE["data"] and (time.time() - _CACHE["at"]) < _CACHE_TTL:
        return _CACHE["data"]

    token, source = get_credentials(session)
    if not token:
        raise RuntimeError(
            "找不到 Claude 憑證：主機沒有 ~/.claude/.credentials.json，也還沒在設定頁貼 token。"
        )
    headers = {
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "dispatch-usage",
        "Accept": "application/json",
    }
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            resp = client.get(USAGE_URL, headers=headers)
    except Exception as exc:  # noqa: BLE001
        cached = _cached_or_none()
        if cached:
            return cached
        raise RuntimeError(f"連線失敗：{exc}")

    if resp.status_code == 429:  # 被限流：回上次結果（標記 stale）
        cached = _cached_or_none()
        if cached:
            cached = {**cached, "stale": True}
            return cached
        raise RuntimeError("Anthropic 端點限流中（每分鐘只能查一次），請稍後再按更新。")
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "Claude token 已過期或無效：請在主機重新登入 Claude Code，或到設定頁重貼 token。"
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code}: {(resp.text or '')[:200]}")

    data = resp.json()
    creds = read_claude_creds() or {}
    result = {
        "subscription_type": (creds.get("claudeAiOauth") or {}).get("subscriptionType"),
        "windows": _find_windows(data),
        "source": source,
        "fetched_at": int(time.time()),
        "stale": False,
    }
    if debug:
        result["raw"] = json.dumps(data)[:800]
    _CACHE["data"] = result
    _CACHE["at"] = time.time()
    return result


def _cached_or_none() -> dict | None:
    if _CACHE["data"] and (time.time() - _CACHE["at"]) < 600:  # 10 分鐘內的舊資料還可用
        return _CACHE["data"]
    return None
