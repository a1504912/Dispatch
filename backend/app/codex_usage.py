"""Codex（ChatGPT）用量查詢。

抓 OpenAI Codex 的用量／額度／Reset 狀態，資料來源是 Codex CLI 也在用的端點：
    GET https://chatgpt.com/backend-api/wham/usage
需要 ChatGPT 的 access token；優先讀主機上的 Codex 登入檔 ~/.codex/auth.json
（tokens.access_token / tokens.account_id），或使用者在設定頁手動貼的 token。

Token 只存在自架主機（登入檔或本機資料庫 Setting 表），不會上傳、不進 git。

自動續期：access token 約 10 天過期。快過期或被拒（401）時，用登入檔裡的 refresh token
照 Codex CLI 的做法（POST auth.openai.com/oauth/token）換新並寫回 auth.json，
CLI 下次啟動會直接用新的，不用再到主機重新登入。
"""

import base64
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
REFRESH_URL = "https://auth.openai.com/oauth/token"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"  # Codex CLI 的公開 client id
REFRESH_EARLY_S = 5 * 60  # 過期前 5 分鐘就先換（跟 CLI 一樣）
# 最近一次自動換新的結果（失敗原因會顯示在畫面上，方便除錯）
LAST_REFRESH: dict = {"at": 0, "ok": None, "detail": ""}
_REFRESH_ERRORS = {
    "refresh_token_expired": "refresh token 已過期、太久沒用",
    "refresh_token_reused": "refresh token 已被用過、可能 CLI 同時在換",
    "refresh_token_invalidated": "refresh token 已被撤銷、登出或重新登入過",
}

K_TOKEN = "codex_access_token"  # 手動貼的 access token（覆寫）
K_ACCOUNT = "codex_account_id"  # 手動貼的 ChatGPT-Account-Id（可空，會嘗試從 token 推得）


def _auth_path() -> str:
    return os.environ.get("CODEX_AUTH_PATH") or str(Path.home() / ".codex" / "auth.json")


def read_codex_auth() -> dict | None:
    """讀 Codex CLI 登入檔；讀不到或格式怪就回 None（不丟例外）。"""
    try:
        with open(_auth_path(), "rb") as f:
            raw = f.read()
        text = raw.decode("utf-8-sig", errors="replace")  # 容錯：吃掉 BOM、壞字元
        return json.loads(text)
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


def _token_exp(token: str) -> float:
    try:
        return float(_decode_jwt_claims(token or "").get("exp") or 0)
    except (TypeError, ValueError):
        return 0


def _lock_dir() -> Path:
    return Path(_auth_path()).parent / ".dispatch_refresh.lock"


def _acquire_lock(wait_s: float = 8.0) -> bool:
    """mkdir 鎖：避免兩個請求同時花同一個 refresh token；超過 60 秒的舊鎖視為卡住。"""
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


def _write_auth_atomic(data: dict) -> None:
    path = Path(_auth_path())
    try:
        path.with_name(path.name + ".dispatch-bak").write_bytes(path.read_bytes())  # 先備份
    except OSError:
        pass
    tmp = path.with_name(path.name + ".dispatch-tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _describe_fail(r) -> str:
    code = ""
    try:
        j = r.json()
        err = j.get("error")
        code = (err.get("code") or err.get("type") or "") if isinstance(err, dict) else str(err or "")
        code = code or str(j.get("code") or j.get("error_description") or "")
    except ValueError:
        if r.status_code == 403 and "Just a moment" in (r.text or ""):
            return "403 被 Cloudflare 驗證擋下"
        code = (r.text or "")[:60].replace("\n", " ")
    return _REFRESH_ERRORS.get(code.lower(), f"HTTP {r.status_code} {code}".strip())


def refresh_if_needed(force: bool = False) -> bool:
    """auth.json 的 access token 快過期（或 force）就用 refresh token 換新並寫回。換成功回 True。"""
    data = read_codex_auth()
    tokens = (data or {}).get("tokens") or {}
    seen_access = tokens.get("access_token")
    if not tokens.get("refresh_token"):
        if data:
            LAST_REFRESH.update(at=time.time(), ok=False, detail="登入檔裡沒有 refresh token")
        return False
    exp = _token_exp(seen_access)
    if not force and exp and exp - time.time() > REFRESH_EARLY_S:
        return False  # 還很新，不用換

    if not _acquire_lock():
        LAST_REFRESH.update(at=time.time(), ok=False, detail="等不到換新鎖")
        return False
    try:
        # 拿到鎖後重讀：CLI 或另一個請求可能剛換過，就不要再花同一個 refresh token
        data = read_codex_auth() or {}
        tokens = data.get("tokens") or {}
        if tokens.get("access_token") != seen_access:
            return True
        refresh_tok = tokens.get("refresh_token")
        body = {"grant_type": "refresh_token", "client_id": CLIENT_ID, "refresh_token": refresh_tok}
        with httpx.Client(timeout=20.0) as client:
            r = client.post(
                REFRESH_URL,
                json=body,
                headers={"Content-Type": "application/json", "Accept": "application/json",
                         "User-Agent": "codex-cli"},
            )
        tok = None
        if r.status_code == 200:
            try:
                tok = r.json()
            except ValueError:
                tok = None
        if not tok or not tok.get("access_token"):
            LAST_REFRESH.update(at=time.time(), ok=False,
                                detail=_describe_fail(r) if r.status_code != 200 else "回應裡沒有 token")
            return False

        tokens["access_token"] = tok["access_token"]
        if tok.get("id_token"):
            tokens["id_token"] = tok["id_token"]
        if tok.get("refresh_token"):
            tokens["refresh_token"] = tok["refresh_token"]  # refresh token 會輪替，一定要存新的
        data["tokens"] = tokens
        data["last_refresh"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        _write_auth_atomic(data)
        LAST_REFRESH.update(at=time.time(), ok=True, detail="")
        return True
    except Exception as exc:  # noqa: BLE001
        LAST_REFRESH.update(at=time.time(), ok=False, detail=f"{type(exc).__name__}: {str(exc)[:120]}")
        return False
    finally:
        _release_lock()


def _cli_credentials() -> tuple[str | None, str | None]:
    tokens = (read_codex_auth() or {}).get("tokens") or {}
    token = tokens.get("access_token")
    if not token:
        return None, None
    return token, tokens.get("account_id") or _account_id_from_token(token)


def get_credentials(session) -> tuple[str | None, str | None, str | None]:
    """回傳 (access_token, account_id, 來源)。先看設定頁手動 token，再讀 ~/.codex/auth.json。"""
    from app.push import get_setting

    token = (get_setting(session, K_TOKEN) or "").strip()
    account = (get_setting(session, K_ACCOUNT) or "").strip()
    if token:
        return token, (account or _account_id_from_token(token)), "manual"

    refresh_if_needed()  # 快過期就先換新
    token, account = _cli_credentials()
    if token:
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


def _get_usage(token: str, account: str | None):
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "codex-cli",
        "Accept": "application/json",
    }
    if account:
        headers["ChatGPT-Account-Id"] = account
    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        return client.get(USAGE_URL, headers=headers)


def fetch_usage(session) -> dict:
    token, account, source = get_credentials(session)
    if not token:
        raise RuntimeError(
            "找不到 Codex 憑證：主機沒有 ~/.codex/auth.json，也還沒在設定頁貼 token。"
        )
    resp = _get_usage(token, account)
    if resp.status_code in (401, 403):
        # 被拒：手動 token 失效就改用登入檔；登入檔的就強制換新後再試一次
        if source == "codex-cli":
            refresh_if_needed(force=True)
        else:
            refresh_if_needed()
        new_token, new_account = _cli_credentials()
        if new_token and new_token != token:
            token, account, source = new_token, new_account, "codex-cli"
            resp = _get_usage(token, account)
    if resp.status_code in (401, 403):
        why = LAST_REFRESH.get("detail") if LAST_REFRESH.get("ok") is False else ""
        raise RuntimeError(
            "Codex token 已過期，自動換新也失敗"
            + (f"（{why}）" if why else "")
            + "：請在主機執行一次 codex login。"
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code}: {(resp.text or '')[:200]}")
    return _normalize(resp.json(), source)
