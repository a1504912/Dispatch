"""台股即時／收盤報價（上市 + 上櫃，含 ETF），免金鑰。

1. 證交所「基本市況報導」即時 API（mis.twse.com.tw），盤中約 5 秒延遲，一次可查多檔，
   代號不知道是上市還是上櫃，就 tse_ / otc_ 兩個都問。
2. 抓不到時改用證交所 / 櫃買中心 OpenAPI 的每日收盤行情（整個市場一次抓，快取 30 分鐘）。
報價快取 60 秒，避免每次開頁面都打證交所。
"""

import re
import time

import httpx

MIS_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
MIS_HOME = "https://mis.twse.com.tw/stock/index.jsp"
TWSE_DAILY = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_DAILY = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json"}

QUOTE_TTL = 60
DAILY_TTL = 1800
_quotes: dict[str, tuple[float, dict]] = {}
_daily: dict = {"ts": 0.0, "data": {}}

CODE_RE = re.compile(r"^[0-9A-Z]{4,6}$")


def norm_code(code: str) -> str:
    return (code or "").strip().upper()


def _num(v) -> float | None:
    try:
        x = float(str(v).replace(",", "").strip())
        return x if x > 0 else None
    except (TypeError, ValueError):
        return None


def _first(v) -> float | None:
    """五檔報價欄位長這樣："1080.0000_1085.0000_..._"，取第一個。"""
    return _num(str(v or "").split("_")[0])


def _from_mis(codes: list[str]) -> dict[str, dict]:
    ex_ch = "|".join(f"{m}_{c}.tw" for c in codes for m in ("tse", "otc"))
    out: dict[str, dict] = {}
    with httpx.Client(timeout=10, follow_redirects=True, headers=UA) as client:
        for attempt in range(2):
            if attempt:  # 第二次先拿 cookie（MIS 偶爾沒 session 會回空）
                client.get(MIS_HOME)
            r = client.get(MIS_URL, params={"ex_ch": ex_ch, "json": "1", "delay": "0", "_": int(time.time() * 1000)})
            if r.status_code != 200:
                continue
            try:
                arr = r.json().get("msgArray") or []
            except ValueError:
                continue
            for m in arr:
                code = norm_code(m.get("c"))
                if not code:
                    continue
                prev = _num(m.get("y"))
                # 最近成交價；這 5 秒沒成交會是 "-"，改用買一 / 賣一，再不行用昨收
                price = _num(m.get("z")) or _first(m.get("b")) or _first(m.get("a")) or prev
                if price is None:
                    continue
                out[code] = {
                    "code": code,
                    "name": m.get("n") or "",
                    "price": price,
                    "prev": prev,
                    "change": round(price - prev, 4) if prev else None,
                    "change_pct": round((price - prev) / prev * 100, 2) if prev else None,
                    "time": f"{m.get('d', '')} {m.get('t', '')}".strip(),
                    "market": "上櫃" if m.get("ex") == "otc" else "上市",
                    "source": "即時",
                }
            if out:
                break
    return out


def _daily_all() -> dict[str, dict]:
    now = time.time()
    if _daily["data"] and now - _daily["ts"] < DAILY_TTL:
        return _daily["data"]
    data: dict[str, dict] = {}
    with httpx.Client(timeout=20, follow_redirects=True, headers=UA) as client:
        try:
            for row in client.get(TWSE_DAILY).json():
                price = _num(row.get("ClosingPrice"))
                if price:
                    raw = str(row.get("Change") or "").strip()
                    chg = _num(raw.lstrip("+-"))
                    if chg and raw.startswith("-"):
                        chg = -chg
                    data[norm_code(row.get("Code"))] = {
                        "name": row.get("Name") or "", "price": price, "change": chg, "market": "上市"}
        except (httpx.HTTPError, ValueError, AttributeError):
            pass
        try:
            for row in client.get(TPEX_DAILY).json():
                price = _num(row.get("Close"))
                if price:
                    raw = str(row.get("Change") or "").strip()
                    chg = _num(raw.lstrip("+-"))
                    if chg and raw.startswith("-"):
                        chg = -chg
                    data[norm_code(row.get("SecuritiesCompanyCode"))] = {
                        "name": row.get("CompanyName") or "", "price": price, "change": chg, "market": "上櫃"}
        except (httpx.HTTPError, ValueError, AttributeError):
            pass
    if data:
        _daily.update(ts=now, data=data)
    return data or _daily["data"]


def get_quotes(codes: list[str]) -> dict[str, dict]:
    """回傳 {代號: {name, price, prev, change, change_pct, time, market, source}}；查不到的不會出現。"""
    now = time.time()
    codes = [c for c in dict.fromkeys(norm_code(c) for c in codes) if CODE_RE.match(c)]
    out = {c: _quotes[c][1] for c in codes if c in _quotes and now - _quotes[c][0] < QUOTE_TTL}
    need = [c for c in codes if c not in out]
    if need:
        got: dict[str, dict] = {}
        for i in range(0, len(need), 20):  # 一次問太多檔 MIS 會拒絕
            try:
                got.update(_from_mis(need[i : i + 20]))
            except httpx.HTTPError:
                pass
        missing = [c for c in need if c not in got]
        if missing:
            try:
                daily = _daily_all()
            except Exception:  # noqa: BLE001
                daily = {}
            for c in missing:
                d = daily.get(c)
                if d:
                    prev = d["price"] - d["change"] if d.get("change") is not None else None
                    got[c] = {
                        "code": c, "name": d["name"], "price": d["price"], "prev": prev,
                        "change": d.get("change"),
                        "change_pct": round(d["change"] / prev * 100, 2) if prev else None,
                        "time": "", "market": d.get("market", ""), "source": "收盤",
                    }
        for c, q in got.items():
            _quotes[c] = (now, q)
        out.update(got)
    return out
