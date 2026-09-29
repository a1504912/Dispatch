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


# ---------- 自動換新登入 token（跟 Claude Code CLI 相同做法） ----------

OAUTH_TOKEN_URLS = (
    "https://platform.claude.com/v1/oauth/token",
    "https://console.anthropic.com/v1/oauth/token",  # 舊網址，新的連不到才用
)
CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"  # Claude Code 的公開 client id
REFRESH_EARLY_MS = 5 * 60 * 1000  # 過期前 5 分鐘就先換


def _lock_dir() -> Path:
    return Path(_creds_path()).parent / ".oauth_refresh.lock"


def _acquire_lock(wait_s: float = 8.0) -> bool:
    """跟 CLI 共用的 mkdir 鎖；超過 60 秒的舊鎖視為卡住，可以接手。"""
    lock = _lock_dir()
    deadline = time.time() + wait_s
    while True:
        try:
            lock.mkdir()
            return True
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 60:
                    lock.rmdir()
                    continue
            except OSError:
                pass
        except OSError:
            return False
        if time.time() > deadline:
            return False
        time.sleep(0.3)


def _release_lock() -> None:
    try:
        _lock_dir().rmdir()
    except OSError:
        pass


def _write_creds_atomic(data: dict) -> None:
    path = Path(_creds_path())
    backup = path.with_name(path.name + ".dispatch-bak")
    try:
        backup.write_bytes(path.read_bytes())  # 寫入前先備份一份
    except OSError:
        pass
    tmp = path.with_name(path.name + ".dispatch-tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def refresh_if_needed(force: bool = False) -> bool:
    """登入檔 token 快過期（或 force）就用 refresh token 換新並寫回。成功換新回 True。"""
    creds = read_claude_creds()
    blk = (creds or {}).get("claudeAiOauth") or {}
    seen_access = blk.get("accessToken")
    try:
        exp = float(blk.get("expiresAt") or 0)
    except (TypeError, ValueError):
        exp = 0
    if not blk.get("refreshToken"):
        return False
    if not force and exp and exp - time.time() * 1000 > REFRESH_EARLY_MS:
        return False  # 還很新，不用換

    if not _acquire_lock():
        return False
    try:
        # 拿到鎖後重讀：CLI 可能剛換過，就不要再花同一個 refresh token
        creds = read_claude_creds() or {}
        blk = creds.get("claudeAiOauth") or {}
        if blk.get("accessToken") != seen_access:
            return True
        refresh_tok = blk.get("refreshToken")
        body = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_tok,
            "client_id": blk.get("clientId") if isinstance(blk.get("clientId"), str) else CLIENT_ID,
        }
        scopes = blk.get("scopes")
        if isinstance(scopes, list) and scopes and all(isinstance(x, str) for x in scopes):
            body["scope"] = " ".join(scopes)

        tok = None
        with httpx.Client(timeout=20.0, follow_redirects=False) as client:
            for url in OAUTH_TOKEN_URLS:
                try:
                    r = client.post(url, json=body, headers={"Content-Type": "application/json", "User-Agent": "anthropic"})
                except httpx.HTTPError:
                    continue
                if r.status_code in (404, 405) or 300 <= r.status_code < 400:
                    continue  # 這個網址不對，換下一個
                if r.status_code == 200:
                    tok = r.json()
                break
        if not tok or not tok.get("access_token"):
            return False

        blk["accessToken"] = tok["access_token"]
        blk["refreshToken"] = tok.get("refresh_token") or refresh_tok  # 沒回新的就保留舊的
        try:
            expires_in = int(tok.get("expires_in") or 0)
        except (TypeError, ValueError):
            expires_in = 0
        if expires_in > 0:
            blk["expiresAt"] = int(time.time() * 1000) + expires_in * 1000
        if isinstance(tok.get("scope"), str) and tok["scope"].strip():
            blk["scopes"] = tok["scope"].split()
        creds["claudeAiOauth"] = blk
        _write_creds_atomic(creds)
        return True
    except Exception:  # noqa: BLE001
        return False
    finally:
        _release_lock()


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


def _get_usage(token: str):
    headers = {
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "dispatch-usage",
        "Accept": "application/json",
    }
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            return client.get(USAGE_URL, headers=headers)
    except Exception:  # noqa: BLE001
        return None


def fetch_usage(session, debug: bool = False) -> dict:
    # 45 秒內剛查過就直接回快取，避免頻繁打端點被限流
    if not debug and _CACHE["data"] and (time.time() - _CACHE["at"]) < _CACHE_TTL:
        return _CACHE["data"]

    token, source = get_credentials(session)
    if not token:
        raise RuntimeError(
            "找不到 Claude 憑證：主機沒有 ~/.claude/.credentials.json，也還沒在設定頁貼 token。"
        )
    # 登入檔的 token 快過期就自動換新（跟 Claude Code CLI 同做法），不用手動跑 claude
    if source == "claude-cli" and refresh_if_needed():
        token, source = get_credentials(session)

    resp = _get_usage(token)
    # 401：可能剛好過期／被 CLI 換掉 → 強制換新一次再試
    if resp is not None and resp.status_code == 401 and source == "claude-cli":
        if refresh_if_needed(force=True):
            token, source = get_credentials(session)
            resp = _get_usage(token)
    if resp is None:
        cached = _cached_or_none()
        if cached:
            return cached
        raise RuntimeError("連線失敗：主機連不到 Anthropic")

    if resp.status_code == 429:  # 被限流：回上次結果（標記 stale）
        cached = _cached_or_none()
        if cached:
            return {**cached, "stale": True}
        raise RuntimeError("Anthropic 端點限流中（每分鐘只能查一次），請稍後再按更新。")
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "Claude 登入已過期且自動換新失敗：在主機開終端機執行一次 claude（進去再離開），就會恢復。"
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
