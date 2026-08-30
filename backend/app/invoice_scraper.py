"""用隱形瀏覽器（Playwright）登入財政部電子發票平台，抓載具發票。

為什麼要用瀏覽器：平台登入是 OAuth2（doLogin → 一連串授權跳轉），手刻很脆弱；
交給真瀏覽器處理最穩，我們只負責「把驗證碼圖片給使用者看、收回輸入」，
以及登入後攔截 searchCarrierInvoice 的回傳。

因為登入中途要等使用者輸入驗證碼，所以每個登入流程開一條專屬執行緒，
用兩個佇列（cmd/res）跟外面溝通；所有 Playwright 呼叫都在同一條執行緒上跑
（Playwright 同步 API 綁定建立它的執行緒，不能跨執行緒使用）。
"""

from __future__ import annotations

import base64
import queue
import threading
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOGIN_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc505w"
INVOICE_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w"
# 登入後直接打這兩個 API（跳過被「領獎設定」擋住的畫面）
JWT_URL = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/getSearchCarrierInvoiceListJWT"
SEARCH_URL = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/searchCarrierInvoice"
DEBUG_DIR = Path(__file__).resolve().parents[2] / "deploy" / "invoice-debug"

# 台灣時區（發票日期是 UTC，要 +8 才是本地日）
TW = timezone(timedelta(hours=8))

_SESSIONS: dict[str, "LoginSession"] = {}
_LOCK = threading.Lock()


def playwright_available() -> bool:
    try:
        import playwright  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def _save_debug(page, tag: str) -> str:
    """出錯時存截圖 + HTML，方便隔空校準選擇器。回傳可讀訊息。"""
    try:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        png = DEBUG_DIR / f"{tag}-{stamp}.png"
        html = DEBUG_DIR / f"{tag}-{stamp}.html"
        page.screenshot(path=str(png), full_page=True)
        html.write_text(page.content(), encoding="utf-8")
        return f"已存除錯檔：{png.name} / {html.name}（在 deploy/invoice-debug/）"
    except Exception:  # noqa: BLE001
        return "（連除錯截圖都存不了）"


def _first(page, selectors: list[str]):
    """回傳第一個存在的元素（找不到回 None）。"""
    for sel in selectors:
        try:
            el = page.query_selector(sel)
            if el:
                return el
        except Exception:  # noqa: BLE001
            continue
    return None


def _click_visible(page, selectors: list[str]) -> bool:
    """只點「看得到」的元素（跳過隱藏的手機版選單）。點到就回 True。"""
    for sel in selectors:
        try:
            els = page.query_selector_all(sel)
        except Exception:  # noqa: BLE001
            els = []
        for el in els:
            try:
                if el.is_visible():
                    el.click(timeout=5000)
                    return True
            except Exception:  # noqa: BLE001
                continue
    return False


def _click_menu(page, label: str) -> bool:
    """精準點左側選單某一項（用「剛好等於這幾個字」的葉節點，避免點到外層大容器）。"""
    # 1) 剛好等於 label 的最內層元素
    try:
        loc = page.get_by_text(label, exact=True)
        for i in range(min(loc.count(), 5)):
            el = loc.nth(i)
            try:
                if el.is_visible():
                    el.click(timeout=5000)
                    return True
            except Exception:  # noqa: BLE001
                continue
    except Exception:  # noqa: BLE001
        pass
    # 2) 當作連結/按鈕點
    for getter in ("link", "button", "menuitem"):
        try:
            loc = page.get_by_role(getter, name=label)
            if loc.count() and loc.first.is_visible():
                loc.first.click(timeout=5000)
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


def _safe_goto(page, url: str) -> bool:
    for state in ("networkidle", "domcontentloaded"):
        try:
            page.goto(url, wait_until=state, timeout=45000)
            return True
        except Exception:  # noqa: BLE001
            continue
    return False


def _norm_date(raw) -> str | None:
    """invoiceDate 例：2026-08-28T16:00:00Z → 本地日 2026-08-29。"""
    if not raw:
        return None
    s = str(raw).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TW).date().isoformat()
    except Exception:  # noqa: BLE001
        # 退而求其次：抓前 10 碼 yyyy-mm-dd
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if len(digits) >= 8:
            return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
        return None


def _rows_from_capture(captured: list[dict]) -> list[dict]:
    """把攔到的 searchCarrierInvoice 回傳整理成統一格式（去重）。"""
    seen: dict[str, dict] = {}
    for body in captured:
        content = (body or {}).get("content") or []
        for it in content:
            num = (it.get("invoiceNumber") or "").strip()
            if not num:
                continue
            d = _norm_date(it.get("invoiceDate"))
            if not d:
                continue
            try:
                amount = float(it.get("totalAmount") or 0)
            except (TypeError, ValueError):
                amount = 0
            seen[num] = {
                "inv_num": num,
                "date": d,
                "seller_name": (it.get("sellerName") or "").strip(),
                "amount": amount,
                "status": str(it.get("extStatus") or it.get("invoiceStrStatus") or "").strip(),
                "donatable": str(it.get("donateMark") or "") in ("0", ""),
            }
    return list(seen.values())


def _auth_headers(page):
    """從登入後的 localStorage/sessionStorage 撈 OAuth token 當 Bearer。
    回 (headers, 診斷字串)。"""
    import json

    hdr = {"content-type": "application/json"}
    dump = {}
    for store in ("localStorage", "sessionStorage"):
        try:
            d = page.evaluate(
                "(s) => { const o={}; const S=window[s]; for(let i=0;i<S.length;i++){const k=S.key(i); o[k]=S.getItem(k);} return o; }",
                store,
            )
            if d:
                dump.update(d)
        except Exception:  # noqa: BLE001
            continue

    token = ""
    # 1) 值本身就是 JWT（ey 開頭、兩個點）
    for v in dump.values():
        if isinstance(v, str) and v.startswith("ey") and v.count(".") == 2 and len(v) > 60:
            token = v
            break
    # 2) 值是 JSON，裡面有 access_token 之類
    if not token:
        for v in dump.values():
            if not isinstance(v, str) or "{" not in v:
                continue
            try:
                obj = json.loads(v)
            except Exception:  # noqa: BLE001
                continue
            if isinstance(obj, dict):
                for key in ("access_token", "accessToken", "token", "id_token", "idToken"):
                    val = obj.get(key)
                    if isinstance(val, str) and val.startswith("ey"):
                        token = val
                        break
            if token:
                break

    if token:
        hdr["Authorization"] = "Bearer " + token
    diag = f"keys={list(dump.keys())[:12]} token={'有' if token else '無'}"
    return hdr, diag


def _api_fetch(page, days: int, sp_headers: dict | None = None):
    """登入後用同一個 session 直接打 API 拿發票（繞過畫面）。回 (rows, err)。
    sp_headers：從 SPA 自己請求偷來的整包標頭（含 Authorization / Origin 等）。"""
    import json

    context = page.context
    drop = {"host", "content-length", "accept-encoding", "cookie", ":authority", ":method", ":path", ":scheme"}
    hdr = {}
    if sp_headers:
        for k, v in sp_headers.items():
            if k.lower() in drop:
                continue
            hdr[k] = v
    hdr["content-type"] = "application/json"
    hdr.setdefault("origin", "https://www.einvoice.nat.gov.tw")
    hdr.setdefault("referer", "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/detail")
    has_auth = bool(hdr.get("authorization") or hdr.get("Authorization"))
    auth_diag = f"authFrom={'攔截' if sp_headers else '無'} auth={'有' if has_auth else '無'} n={len(sp_headers or {})}"

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=max(1, min(days, 365)))
    jwt_payload = {
        "cardCode": "",
        "carrierId2": "",
        "invoiceStatus": "all",
        "isSearchAll": "true",
        "searchStartDate": start.strftime("%Y-%m-%dT00:00:00.000Z"),
        "searchEndDate": now.strftime("%Y-%m-%dT23:59:59.000Z"),
    }
    try:
        r1 = context.request.post(JWT_URL, data=json.dumps(jwt_payload), headers=hdr, timeout=30000)
    except Exception as exc:  # noqa: BLE001
        return None, f"getJWT 例外：{exc}｜{auth_diag}"
    if not r1.ok:
        try:
            body = (r1.text() or "")[:200]
        except Exception:  # noqa: BLE001
            body = ""
        return None, f"getJWT HTTP {r1.status}｜{auth_diag}｜回應：{body}"

    # 回傳可能是純 JWT 字串，或包在 JSON 裡
    jwt = ""
    try:
        j = r1.json()
        if isinstance(j, str):
            jwt = j
        elif isinstance(j, dict):
            jwt = j.get("token") or j.get("data") or j.get("jwt") or ""
    except Exception:  # noqa: BLE001
        pass
    if not jwt:
        jwt = (r1.text() or "").strip().strip('"')
    if not jwt or len(jwt) < 20:
        return None, "拿不到 JWT 權杖（可能欄位名不對）"

    bodies = []
    # Spring 分頁：size 開大一次抓完；保險再照 totalPages 逐頁
    for page_no in range(0, 60):
        url = f"{SEARCH_URL}?page={page_no}&size=200"
        try:
            r2 = context.request.post(url, data=json.dumps({"token": jwt}), headers=hdr, timeout=30000)
        except Exception as exc:  # noqa: BLE001
            return None, f"search 例外：{exc}"
        if not r2.ok:
            if page_no == 0:
                try:
                    b = (r2.text() or "")[:200]
                except Exception:  # noqa: BLE001
                    b = ""
                return None, f"search HTTP {r2.status}｜回應：{b}"
            break
        try:
            body = r2.json()
        except Exception:  # noqa: BLE001
            break
        bodies.append(body)
        total_pages = int(body.get("totalPages") or 1)
        if page_no >= total_pages - 1:
            break

    rows = _rows_from_capture(bodies)
    return rows, None


class LoginSession(threading.Thread):
    """一次登入流程。start_login() 開瀏覽器並回傳驗證碼圖；submit_captcha() 送出並抓發票。"""

    def __init__(self, custom_id: str, password: str):
        super().__init__(daemon=True)
        self.custom_id = custom_id
        self.password = password
        self.cmd_q: queue.Queue = queue.Queue()
        self.res_q: queue.Queue = queue.Queue()
        self.created = time.time()

    # ---- 對外 API（在 FastAPI 執行緒呼叫）----

    def start_login(self, timeout=90) -> dict:
        self.start()
        return self.res_q.get(timeout=timeout)

    def submit_captcha(self, captcha: str, timeout=120) -> dict:
        self.cmd_q.put({"captcha": captcha})
        return self.res_q.get(timeout=timeout)

    # ---- 執行緒本體（所有 Playwright 呼叫都在這裡）----

    def run(self):
        from playwright.sync_api import sync_playwright

        captured: list[dict] = []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    locale="zh-TW",
                    viewport={"width": 1366, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                    ),
                )
                page = context.new_page()

                api_hits: list[str] = []
                sp_headers: dict = {}  # 偷 SPA 打服務端 API 時的整包標頭（含授權）

                def on_response(resp):
                    if "searchCarrierInvoice" in resp.url:
                        try:
                            captured.append(resp.json())
                        except Exception:  # noqa: BLE001
                            pass
                    if "btc502w" in resp.url or "CarrierInvoice" in resp.url:
                        api_hits.append(f"{resp.status} {resp.url.rsplit('/', 1)[-1]}")

                def on_request(req):
                    # 偷 SPA 打 service-mc 上 /api/ 的請求標頭（含 Authorization）
                    try:
                        if "service-mc.einvoice.nat.gov.tw" in req.url and "/api/" in req.url:
                            h = dict(req.headers)
                            if h.get("authorization") or "cloud/api" in req.url:
                                sp_headers.clear()
                                sp_headers.update(h)
                    except Exception:  # noqa: BLE001
                        pass

                page.on("response", on_response)
                page.on("request", on_request)

                # 1) 開登入頁，填帳密
                page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(1500)

                id_box = _first(
                    page,
                    [
                        "input[placeholder*='手機號碼']",
                        "input[placeholder*='條碼']",
                        "input[placeholder*='手機']",
                        "input[type='text']",
                        "input[name*='customId']",
                        "input[name*='account']",
                    ],
                )
                pw_box = _first(
                    page,
                    [
                        "input[placeholder*='驗證碼(密碼)']",
                        "input[placeholder*='密碼']",
                        "input[type='password']",
                        "input[name*='password']",
                    ],
                )
                if not id_box or not pw_box:
                    msg = _save_debug(page, "login-form")
                    self.res_q.put({"ok": False, "error": "找不到帳號/密碼欄位。" + msg})
                    return
                id_box.fill(self.custom_id)
                pw_box.fill(self.password)

                # 2) 抓驗證碼圖（優先抓 <img>；抓不到就截整頁讓使用者找）
                cap_img = _first(
                    page,
                    [
                        "img[src*='captcha']",
                        "img[alt*='驗證碼']",
                        "img[alt*='圖形']",
                    ],
                )
                try:
                    # 只有明確是「captcha 圖」才單獨截；否則截整個登入畫面（避免抓錯圖）
                    if cap_img and cap_img.is_visible():
                        raw = cap_img.screenshot()
                    else:
                        raw = page.screenshot()
                    cap_b64 = "data:image/png;base64," + base64.b64encode(raw).decode()
                except Exception:  # noqa: BLE001
                    cap_b64 = ""

                self.res_q.put({"ok": True, "captcha_image": cap_b64})

                # 3) 等前端把驗證碼送回來
                cmd = self.cmd_q.get(timeout=180)
                captcha = (cmd.get("captcha") or "").strip()

                cap_box = _first(
                    page,
                    [
                        "input[placeholder*='驗證碼']:not([placeholder*='密碼'])",
                        "input[name*='captcha']",
                        "input[maxlength='5']",
                    ],
                )
                if not cap_box:
                    msg = _save_debug(page, "captcha-box")
                    self.res_q.put({"ok": False, "error": "找不到驗證碼輸入框。" + msg})
                    return
                cap_box.fill(captcha)

                # 4) 按登入
                btn = _first(
                    page,
                    [
                        "button:has-text('登入')",
                        "button[type='submit']",
                        "input[type='submit']",
                    ],
                )
                if btn:
                    btn.click()
                else:
                    cap_box.press("Enter")

                # 5) 等 OAuth 跳轉完成。不看網址（跳轉中會變來變去），改看
                #    「登入後才有的東西」（登出鈕 / 左側選單）出現才算成功。
                logged_in = False
                login_err = ""
                for _ in range(30):  # 最多等 ~30 秒
                    page.wait_for_timeout(1000)
                    # 真的驗證碼/密碼錯 → 直接結束
                    for kw in ("驗證碼錯", "驗證碼不正", "驗證碼有誤", "密碼錯", "帳號或密碼"):
                        try:
                            el = page.query_selector(f"text={kw}")
                            if el and el.is_visible():
                                login_err = (el.inner_text() or kw).strip()[:40]
                                break
                        except Exception:  # noqa: BLE001
                            continue
                    if login_err:
                        break
                    # 登入成功訊號：登出鈕、或手機條碼專區的左側選單
                    try:
                        for sig in ("text=登出", "text=發票查詢及捐贈", "text=領獎設定"):
                            el = page.query_selector(sig)
                            if el and el.is_visible():
                                logged_in = True
                                break
                    except Exception:  # noqa: BLE001
                        pass
                    if logged_in:
                        break

                after_login_url = page.url
                login_dbg = _save_debug(page, "after-login")
                if not logged_in:
                    self.res_q.put(
                        {
                            "ok": False,
                            "error": (
                                f"登入失敗：{login_err}，請重試。"
                                if login_err
                                else f"登入等待逾時（可能驗證碼錯或平台慢）。網址：{after_login_url}"
                            ),
                        }
                    )
                    return

                # ★ 登入成功後：先直接打 API（繞過被「領獎設定」擋住的畫面）
                # 重新整理一兩次讓 SPA 再發一輪服務端 API，好偷到授權標頭
                for _ in range(2):
                    if sp_headers.get("authorization"):
                        break
                    try:
                        page.reload(wait_until="networkidle", timeout=30000)
                    except Exception:  # noqa: BLE001
                        pass
                    page.wait_for_timeout(3000)
                api_rows, api_err = _api_fetch(page, 90, sp_headers)
                if api_rows:
                    context.close()
                    browser.close()
                    self.res_q.put(
                        {"ok": True, "invoices": api_rows, "via": "api", "total_pages": 1, "pages_captured": 1}
                    )
                    return

                # API 沒成 → 立刻回報原因（不再浪費時間去點註定失敗的畫面）
                inv_dbg = _save_debug(page, "invoice-page")
                cur_url = page.url
                context.close()
                browser.close()
                self.res_q.put(
                    {
                        "ok": True,
                        "invoices": [],
                        "total_pages": 1,
                        "pages_captured": 0,
                        "current_url": cur_url,
                        "api_err": api_err,
                        "debug": inv_dbg,
                    }
                )
        except Exception as exc:  # noqa: BLE001
            self.res_q.put(
                {"ok": False, "error": f"{type(exc).__name__}: {exc}", "trace": traceback.format_exc()[:1500]}
            )


def _cleanup():
    """清掉超過 5 分鐘的殘留登入流程。"""
    now = time.time()
    with _LOCK:
        for sid in [s for s, v in _SESSIONS.items() if now - v.created > 300]:
            _SESSIONS.pop(sid, None)


def begin(custom_id: str, password: str) -> dict:
    """開一個登入流程，回 {sid, captcha_image} 或 {error}。"""
    _cleanup()
    sess = LoginSession(custom_id, password)
    try:
        res = sess.start_login()
    except queue.Empty:
        return {"ok": False, "error": "開啟瀏覽器逾時（主機可能還沒裝 Playwright 或太慢）"}
    if not res.get("ok"):
        return res
    sid = uuid.uuid4().hex
    with _LOCK:
        _SESSIONS[sid] = sess
    return {"ok": True, "sid": sid, "captcha_image": res.get("captcha_image", "")}


def finish(sid: str, captcha: str) -> dict:
    """送出驗證碼，完成登入並抓發票，回 {invoices:[...]} 或 {error}。"""
    with _LOCK:
        sess = _SESSIONS.pop(sid, None)
    if not sess:
        return {"ok": False, "error": "登入流程已逾時，請重新開始"}
    try:
        return sess.submit_captcha(captcha)
    except queue.Empty:
        return {"ok": False, "error": "抓取逾時，請重試"}
