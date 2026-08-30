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
INVOICE_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/detail"
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
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                    ),
                )
                page = context.new_page()

                def on_response(resp):
                    if "searchCarrierInvoice" in resp.url:
                        try:
                            captured.append(resp.json())
                        except Exception:  # noqa: BLE001
                            pass

                page.on("response", on_response)

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
                        "img[src^='data:image']",
                    ],
                )
                try:
                    if cap_img:
                        raw = cap_img.screenshot()
                    else:
                        raw = page.screenshot(full_page=True)
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

                # 5) 等 OAuth 跳轉完成（登入成功會離開登入頁）
                try:
                    page.wait_for_url(lambda u: "btc505w" not in u, timeout=30000)
                except Exception:  # noqa: BLE001
                    pass
                try:
                    page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:  # noqa: BLE001
                    pass
                page.wait_for_timeout(2500)
                after_login_url = page.url
                login_dbg = _save_debug(page, "after-login")  # 一律存，方便判斷登入成敗
                if "btc505w" in after_login_url:
                    self.res_q.put(
                        {
                            "ok": False,
                            "error": f"登入後仍停在登入頁，多半是驗證碼或密碼錯。目前網址：{after_login_url}。{login_dbg}",
                        }
                    )
                    return

                # 6) 到發票查詢頁，觸發查詢（會發出 searchCarrierInvoice）
                try:
                    page.goto(INVOICE_URL, wait_until="networkidle", timeout=45000)
                except Exception:  # noqa: BLE001
                    page.goto(INVOICE_URL, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(3500)

                # 沒自動查詢的話，主動按「查詢」
                if not captured:
                    qbtn = _first(
                        page,
                        [
                            "button:has-text('查詢')",
                            "button:has-text('查 詢')",
                            "a:has-text('查詢')",
                            "button[type='submit']",
                        ],
                    )
                    if qbtn:
                        try:
                            qbtn.click()
                        except Exception:  # noqa: BLE001
                            pass
                    page.wait_for_timeout(3500)

                inv_dbg = _save_debug(page, "invoice-page")  # 一律存發票頁截圖

                # 6b) 盡量翻頁把每頁都抓到
                total_pages = 1
                if captured:
                    total_pages = max((c.get("totalPages") or 1) for c in captured)
                for _ in range(max(0, total_pages - 1)):
                    nxt = _first(
                        page,
                        [
                            "button[aria-label*='下一頁']",
                            "button:has-text('下一頁')",
                            "li.next:not(.disabled) a",
                            "button.next-page",
                        ],
                    )
                    if not nxt:
                        break
                    try:
                        nxt.click()
                        page.wait_for_timeout(1500)
                    except Exception:  # noqa: BLE001
                        break

                rows = _rows_from_capture(captured)
                got_pages = len(captured)
                cur_url = page.url
                context.close()
                browser.close()
                self.res_q.put(
                    {
                        "ok": True,
                        "invoices": rows,
                        "total_pages": total_pages,
                        "pages_captured": got_pages,
                        "current_url": cur_url,
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
