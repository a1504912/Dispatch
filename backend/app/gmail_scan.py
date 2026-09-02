"""從 Gmail 收據信偵測「訂閱」候選項目（Google Play、Netflix、Spotify…）。

沒有官方 API 能列出使用者的 Google Play 訂閱，但這些服務每次扣款都會寄收據 email。
我們用已授權的 Google token（需含 gmail.readonly），搜尋收據信、解析出「商家 + 金額 +
日期」，回傳候選清單讓使用者確認後加入訂閱。純讀取、best-effort，抓不到的可手動加。
"""

import re
from collections import defaultdict
from datetime import datetime

import httpx
from sqlmodel import Session

from app import google_calendar as gc

GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

# 常見訂閱寄件者（高信心）+ 一般收據關鍵字（廣撒）
QUERY = (
    "newer_than:180d ("
    "from:googleplay-noreply@google.com OR from:payments-noreply@google.com OR "
    "from:no-reply@spotify.com OR from:info@account.netflix.com OR "
    "from:no_reply@email.apple.com OR from:noreply@youtube.com OR "
    'subject:(收據 OR 訂單 OR receipt OR invoice OR 訂閱 OR subscription OR 續約 OR 續訂 OR renewed)'
    ")"
)

# 金額樣式：NT$390 / $390 / 390 元 / TWD 390
_AMOUNT_RES = [
    re.compile(r"(?:NT\$|NT＄|TWD|US\$|USD|＄|\$)\s?([\d,]+(?:\.\d{1,2})?)"),
    re.compile(r"([\d,]+(?:\.\d{1,2})?)\s?(?:元|TWD)"),
]

# 從寄件者/主旨猜商家名（比 domain 好看）
_KNOWN = {
    "googleplay": "Google Play",
    "google.com": "Google Play",
    "spotify": "Spotify",
    "netflix": "Netflix",
    "apple": "Apple",
    "youtube": "YouTube Premium",
    "disney": "Disney+",
    "notion": "Notion",
    "openai": "ChatGPT",
    "evernote": "Evernote",
}


def _amount(text: str) -> float:
    for rx in _AMOUNT_RES:
        for m in rx.finditer(text or ""):
            try:
                v = float(m.group(1).replace(",", ""))
            except ValueError:
                continue
            if 1 <= v <= 100000:  # 過濾掉訂單編號之類的怪數字
                return v
    return 0.0


def _sender_name(from_hdr: str) -> tuple[str, str]:
    """回 (顯示名, email)。"""
    m = re.match(r"\s*(.*?)\s*<(.+?)>", from_hdr or "")
    if m:
        return m.group(1).strip().strip('"'), m.group(2).strip().lower()
    return "", (from_hdr or "").strip().lower()


def _merchant(name: str, email: str, subject: str) -> str:
    blob = f"{name} {email} {subject}".lower()
    for key, label in _KNOWN.items():
        if key in blob:
            return label
    if name and "noreply" not in name.lower() and "no-reply" not in name.lower():
        return name
    # 退而求其次用 domain 的主體
    dom = email.split("@")[-1].split(".")
    return (dom[-2] if len(dom) >= 2 else email) or "訂閱"


def scan(session: Session, max_msgs: int = 40) -> list[dict]:
    token = gc._access_token(session)  # 會自動 refresh；沒連 Google 會丟 NotConnected
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=30) as client:
        r = client.get(
            f"{GMAIL_BASE}/messages",
            params={"q": QUERY, "maxResults": max_msgs},
            headers=headers,
        )
        if r.status_code == 403:
            raise PermissionError("Gmail 權限不足，請重新連結 Google 並允許讀取 Gmail")
        r.raise_for_status()
        ids = [m["id"] for m in (r.json().get("messages") or [])]

        # 商家 → 累積的收據
        groups: dict[str, dict] = defaultdict(lambda: {"amounts": [], "dates": []})
        for mid in ids:
            mr = client.get(
                f"{GMAIL_BASE}/messages/{mid}",
                params={
                    "format": "metadata",
                    "metadataHeaders": ["From", "Subject", "Date"],
                },
                headers=headers,
            )
            if mr.status_code != 200:
                continue
            msg = mr.json()
            hdrs = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
            snippet = msg.get("snippet", "") or ""
            subject = hdrs.get("subject", "")
            name, email = _sender_name(hdrs.get("from", ""))
            amt = _amount(subject) or _amount(snippet)
            if amt <= 0:
                continue
            merchant = _merchant(name, email, subject)
            # 日期（epoch ms）
            ts = msg.get("internalDate")
            try:
                d = datetime.utcfromtimestamp(int(ts) / 1000).date() if ts else None
            except (TypeError, ValueError):
                d = None
            g = groups[merchant]
            g["amounts"].append(amt)
            if d:
                g["dates"].append(d)
            g.setdefault("subject", subject)

    out = []
    for merchant, g in groups.items():
        amounts = g["amounts"]
        dates = sorted(g["dates"]) if g["dates"] else []
        # 取最常出現的金額（比 max/min 穩）
        common = max(set(amounts), key=amounts.count)
        last = dates[-1] if dates else None
        out.append(
            {
                "name": merchant,
                "amount": common,
                "count": len(amounts),  # 找到幾封收據（越多越像訂閱）
                "last_date": last.isoformat() if last else None,
                "day": last.day if last else 1,
                "sample": g.get("subject", "")[:60],
            }
        )
    # 收據越多、越近的排前面
    out.sort(key=lambda c: (c["count"], c["last_date"] or ""), reverse=True)
    return out
