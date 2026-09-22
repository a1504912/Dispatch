"""比價：上網抓真實商品報價（不需要 AI、不用付費）。

來源（每家各自獨立、其中一家掛掉不影響其他家）：
  - PChome 線上購物：新品，JSON 搜尋 API，穩、快。
  - 露天拍賣 Ruten：量大、很多「二手」與便宜貨，JSON API（兩段式：先搜 id 再抓明細）。

之後要加別家（momo、Google 購物…）就在這裡多寫一個 _search_xxx，再加進 SOURCES。

注意：這支設計成跑在「自架主機」上（住宅 IP、可正常對外連線）。在受限的雲端環境
可能連不出去，屬正常。
"""

import httpx

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


# ---------- PChome（新品） ----------

PCHOME_URL = "https://ecshweb.pchome.com.tw/search/v3.3/all/results"


def _search_pchome(query: str, limit: int) -> list[dict]:
    headers = {"User-Agent": _UA, "Referer": "https://ecshweb.pchome.com.tw/", "Accept": "application/json"}
    params = {"q": query, "page": 1, "sort": "sale/dc"}
    with httpx.Client(timeout=15.0, headers=headers, follow_redirects=True) as client:
        resp = client.get(PCHOME_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    out: list[dict] = []
    for p in (data.get("prods") or [])[:limit]:
        pid = (p.get("Id") or "").strip()
        name = (p.get("name") or "").strip()
        price = p.get("price")
        if not name or price is None:
            continue
        pic = (p.get("picS") or p.get("picB") or "").strip()
        image = f"https://cs-a.ecimg.tw{pic}" if pic.startswith("/") else (pic or None)
        out.append(
            {
                "title": name,
                "price": _num(price),
                "url": f"https://24h.pchome.com.tw/prod/{pid}" if pid else "",
                "store": "PChome",
                "image": image,
                "condition": "new",
            }
        )
    return out


# ---------- 露天拍賣 Ruten（含二手、便宜貨） ----------

RUTEN_SEARCH = "https://rtapi.ruten.com.tw/api/search/v3/index.php/core/prod"
RUTEN_ITEMS = "https://rapi.ruten.com.tw/api/items/v2/list"


def _search_ruten(query: str, limit: int) -> list[dict]:
    headers = {"User-Agent": _UA, "Referer": "https://www.ruten.com.tw/", "Accept": "application/json"}
    with httpx.Client(timeout=15.0, headers=headers, follow_redirects=True) as client:
        # 第一段：搜尋拿商品 id
        r1 = client.get(
            RUTEN_SEARCH,
            params={"q": query, "type": "direct", "sort": "rnk/dc", "limit": limit, "offset": 1},
        )
        r1.raise_for_status()
        rows = (r1.json() or {}).get("Rows") or []
        ids = [str(x.get("Id")) for x in rows if x.get("Id")][:limit]
        if not ids:
            return []
        # 第二段：一次抓多筆商品明細
        r2 = client.get(RUTEN_ITEMS, params={"gno": ",".join(ids), "level": "simple"})
        r2.raise_for_status()
        items = r2.json()

    if isinstance(items, dict):  # 有時包在 {"data":[...]}
        items = items.get("data") or items.get("Rows") or []

    out: list[dict] = []
    for it in items or []:
        name = (it.get("ProdName") or it.get("Name") or it.get("name") or "").strip()
        pid = str(it.get("Id") or it.get("GoodsNo") or it.get("ProdId") or "").strip()
        price = _ruten_price(it)
        if not name or price is None:
            continue
        image = _ruten_image(it)
        out.append(
            {
                "title": name,
                "price": price,
                "url": f"https://www.ruten.com.tw/item/show?{pid}" if pid else "",
                "store": "露天拍賣",
                "image": image,
                "condition": "used",  # 露天以拍賣/二手為大宗，統一標二手提醒使用者留意
            }
        )
    return out


def _ruten_price(it: dict):
    pr = it.get("PriceRange")
    if isinstance(pr, (list, tuple)) and pr:
        return _num(pr[0])
    for key in ("Price", "DirectPrice", "price", "GoodsPrice"):
        if it.get(key) is not None:
            return _num(it.get(key))
    return None


def _ruten_image(it: dict):
    img = it.get("Image") or it.get("image") or ""
    if isinstance(img, list):
        img = img[0] if img else ""
    img = str(img).strip()
    if not img:
        return None
    if img.startswith("//"):
        return "https:" + img
    if img.startswith("http"):
        return img
    return None


# ---------- 共用 ----------


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# 來源清單：(顯示名稱, 函式)
SOURCES = [
    ("PChome", _search_pchome),
    ("露天拍賣", _search_ruten),
]


def search(query: str, limit_per_source: int = 15) -> dict:
    """依關鍵字上網查目前報價，彙整多家來源。

    回傳 {results, sources}；results 依價格由低到高排序。sources 記錄每家成功/失敗，
    方便前端顯示「哪幾家有查到」，也方便日後除錯。
    """
    query = (query or "").strip()
    if not query:
        return {"results": [], "sources": []}

    results: list[dict] = []
    sources: list[dict] = []
    for name, fn in SOURCES:
        try:
            rows = fn(query, limit_per_source)
            results.extend(rows)
            sources.append({"store": name, "ok": True, "count": len(rows)})
        except Exception as exc:  # noqa: BLE001
            sources.append({"store": name, "ok": False, "count": 0, "error": str(exc)[:200]})

    # 依價格由低到高（沒價格的排最後）
    results.sort(key=lambda r: (r.get("price") is None, r.get("price") or 0))
    return {"results": results, "sources": sources}
