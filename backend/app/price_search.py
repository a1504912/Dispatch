"""比價：上網抓真實商品報價（不需要 AI、不用付費）。

來源（每家各自獨立、平行查詢，其中一家掛掉不影響其他家）：
  - PChome 線上購物：新品，JSON 搜尋 API（抓多頁），穩、快。
  - momo 購物網：新品，搜尋頁 HTML 解析。
  - 蝦皮購物 Shopee：JSON API（反爬蟲兇，常被擋 403）。
  - 露天拍賣 Ruten：量大、很多二手，JSON API（兩段式）。
  - 旋轉拍賣 Carousell：二手為主，JSON API。

每家查詢都會回傳一小段「診斷樣本」（原始回傳的前幾百字），debug=1 時附在結果裡，
方便對照實際格式微調解析規則。

注意：這支設計成跑在「自架主機」上（住宅 IP、可正常對外連線）。在受限的雲端環境
可能連不出去，屬正常。
"""

import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _num(v):
    try:
        if isinstance(v, str):
            v = v.replace(",", "").strip()
        return float(v)
    except (TypeError, ValueError):
        return None


def _snip(resp, extra: str = "") -> str:
    """把一次回應濃縮成短診斷字串。"""
    try:
        body = resp.text[:400].replace("\n", " ")
    except Exception:  # noqa: BLE001
        body = "<無法讀取內容>"
    return f"HTTP {resp.status_code} {extra}｜{body}"


# ---------- PChome（新品；抓多頁） ----------

PCHOME_URL = "https://ecshweb.pchome.com.tw/search/v3.3/all/results"


def _search_pchome(query: str, limit: int):
    headers = {"User-Agent": _UA, "Referer": "https://ecshweb.pchome.com.tw/", "Accept": "application/json"}
    out: list[dict] = []
    sample = ""
    pages = max(1, (limit + 19) // 20)  # 每頁約 20 筆
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        for page in range(1, pages + 1):
            resp = client.get(PCHOME_URL, params={"q": query, "page": page, "sort": "sale/dc"})
            resp.raise_for_status()
            data = resp.json()
            if page == 1:
                sample = _snip(resp, f"totalPage={data.get('totalPage')}")
            prods = data.get("prods") or []
            for p in prods:
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
            if len(out) >= limit or page >= (data.get("totalPage") or 1):
                break
    return out[:limit], sample


# ---------- momo 購物網（新品；HTML 解析） ----------

MOMO_URL = "https://www.momoshop.com.tw/search/searchShop.jsp"


def _search_momo(query: str, limit: int):
    headers = {
        "User-Agent": _UA,
        "Referer": "https://www.momoshop.com.tw/",
        "Accept": "text/html,application/xhtml+xml",
    }
    params = {"keyword": query, "searchType": "1", "curPage": "1", "_isFuzzy": "0"}
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        resp = client.get(MOMO_URL, params=params)
        resp.raise_for_status()
        html = resp.text
    sample = _snip(resp, f"len={len(html)}")

    out: list[dict] = []
    for m in re.finditer(r"i_code=(\d+)", html):
        code = m.group(1)
        seg = html[m.start(): m.start() + 1500]
        name_m = (
            re.search(r'class="prdName"[^>]*>([^<]+)</', seg)
            or re.search(r'class="prd_name"[^>]*>([^<]+)</', seg)
            or re.search(r'title="([^"]+)"', seg)
        )
        price_m = (
            re.search(r'class="price"[^>]*>\s*<b>\s*\$?\s*([\d,]+)', seg)
            or re.search(r'"price"[^>]*>[^\d]*([\d,]+)', seg)
            or re.search(r'\$\s*([\d,]{2,})', seg)
        )
        img_m = re.search(r'<img[^>]+src="(//[^"]+?\.(?:jpg|png|webp)[^"]*)"', seg) or re.search(
            r'data-original="(//[^"]+?\.(?:jpg|png|webp)[^"]*)"', seg
        )
        name = name_m.group(1).strip() if name_m else ""
        price = _num(price_m.group(1)) if price_m else None
        if not name or price is None:
            continue
        image = ("https:" + img_m.group(1)) if img_m else None
        out.append(
            {
                "title": name,
                "price": price,
                "url": f"https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code={code}",
                "store": "momo",
                "image": image,
                "condition": "new",
            }
        )
        if len(out) >= limit:
            break
    return out, sample


# ---------- 蝦皮購物 Shopee（JSON API） ----------

SHOPEE_URL = "https://shopee.tw/api/v4/search/search_items"


def _search_shopee(query: str, limit: int):
    headers = {
        "User-Agent": _UA,
        "Referer": f"https://shopee.tw/search?keyword={query}",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-API-SOURCE": "pc",
    }
    params = {
        "by": "relevancy",
        "keyword": query,
        "limit": limit,
        "newest": 0,
        "order": "desc",
        "page_type": "search",
        "scenario": "PAGE_GLOBAL_SEARCH",
        "version": 2,
    }
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        resp = client.get(SHOPEE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    sample = _snip(resp, f"items={len(data.get('items') or [])}")

    out: list[dict] = []
    for it in (data.get("items") or [])[:limit]:
        b = it.get("item_basic") or {}
        name = (b.get("name") or "").strip()
        raw_price = b.get("price")
        if not name or raw_price is None:
            continue
        price = _num(raw_price)
        if price:
            price = price / 100000.0
        itemid = b.get("itemid")
        shopid = b.get("shopid")
        img = b.get("image") or ""
        image = f"https://cf.shopee.tw/file/{img}" if img else None
        out.append(
            {
                "title": name,
                "price": price,
                "url": f"https://shopee.tw/product/{shopid}/{itemid}" if itemid and shopid else "",
                "store": "蝦皮",
                "image": image,
                "condition": "",
            }
        )
    return out, sample


# ---------- 露天拍賣 Ruten（含二手；兩段式） ----------

RUTEN_SEARCH = "https://rtapi.ruten.com.tw/api/search/v3/index.php/core/prod"
RUTEN_ITEMS = "https://rapi.ruten.com.tw/api/items/v2/list"


def _search_ruten(query: str, limit: int):
    headers = {"User-Agent": _UA, "Referer": "https://www.ruten.com.tw/", "Accept": "application/json"}
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        r1 = client.get(
            RUTEN_SEARCH,
            params={"q": query, "type": "direct", "sort": "rnk/dc", "limit": limit, "offset": 1},
        )
        r1.raise_for_status()
        j1 = r1.json() or {}
        rows = j1.get("Rows") or []
        ids = [str(x.get("Id")) for x in rows if x.get("Id")][:limit]
        if not ids:
            return [], _snip(r1, "第一段沒拿到 id")
        r2 = client.get(RUTEN_ITEMS, params={"gno": ",".join(ids), "level": "simple"})
        r2.raise_for_status()
        items = r2.json()
    sample = _snip(r2, f"ids={len(ids)}")

    if isinstance(items, dict):
        items = items.get("data") or items.get("Rows") or []

    out: list[dict] = []
    for it in items or []:
        name = (it.get("ProdName") or it.get("Name") or it.get("name") or "").strip()
        pid = str(it.get("Id") or it.get("GoodsNo") or it.get("ProdId") or "").strip()
        price = _ruten_price(it)
        if not name or price is None:
            continue
        out.append(
            {
                "title": name,
                "price": price,
                "url": f"https://www.ruten.com.tw/item/show?{pid}" if pid else "",
                "store": "露天拍賣",
                "image": _ruten_image(it),
                "condition": "used",
            }
        )
    return out, sample


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
    return img if img.startswith("http") else None


# ---------- 旋轉拍賣 Carousell（二手為主） ----------

CAROUSELL_URL = "https://tw.carousell.com/api-service/filter/search/4.0/products/"


def _search_carousell(query: str, limit: int):
    headers = {
        "User-Agent": _UA,
        "Referer": f"https://tw.carousell.com/search/{query}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    body = {"count": limit, "query": query, "filters": [], "locale": "zh-TW", "sortParam": {"fieldName": "relevance"}}
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        resp = client.post(CAROUSELL_URL, json=body)
        resp.raise_for_status()
        data = resp.json()
    sample = _snip(resp)

    results = (data.get("data") or data).get("results") or data.get("results") or []
    out: list[dict] = []
    for r in results[:limit]:
        card = r.get("listingCard") or r
        pid = str(card.get("id") or "").strip()
        title = _carousell_text(card, ("title",))
        price = _carousell_price(card)
        image = _carousell_image(card)
        if not title or price is None:
            continue
        out.append(
            {
                "title": title,
                "price": price,
                "url": f"https://tw.carousell.com/p/{pid}" if pid else "",
                "store": "旋轉拍賣",
                "image": image,
                "condition": "used",
            }
        )
    return out, sample


def _carousell_text(card: dict, keys) -> str:
    for k in keys:
        v = card.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _carousell_price(card: dict):
    for k in ("price", "priceFormatted"):
        v = card.get(k)
        if isinstance(v, (int, float, str)):
            n = _num(re.sub(r"[^\d.]", "", str(v)))
            if n:
                return n
    bf = card.get("belowFold")
    if isinstance(bf, list):
        for comp in bf:
            s = comp.get("stringContent") if isinstance(comp, dict) else None
            if s and re.search(r"\d", s):
                n = _num(re.sub(r"[^\d.]", "", s))
                if n:
                    return n
    return None


def _carousell_image(card: dict):
    for k in ("primaryPhoto", "photoUrl", "image"):
        v = card.get(k)
        if isinstance(v, str) and v.startswith("http"):
            return v
    return None


# ---------- 彙整 ----------

SOURCES = [
    ("PChome", _search_pchome),
    ("momo", _search_momo),
    ("蝦皮", _search_shopee),
    ("露天拍賣", _search_ruten),
    ("旋轉拍賣", _search_carousell),
]


def _run_one(name, fn, query, limit):
    try:
        rows, sample = fn(query, limit)
        return name, rows, None, sample
    except Exception as exc:  # noqa: BLE001
        return name, [], f"{type(exc).__name__}: {exc}"[:250], ""


def search(query: str, limit_per_source: int = 30, debug: bool = False) -> dict:
    """依關鍵字上網查目前報價，平行彙整多家來源。

    回傳 {results, sources}；results 依價格由低到高排序。每個 source 含 store/ok/count，
    失敗時含 error；debug=True 時另含 sample（原始回傳片段）方便對照修正。
    """
    query = (query or "").strip()
    if not query:
        return {"results": [], "sources": []}

    results: list[dict] = []
    status: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        futures = [pool.submit(_run_one, name, fn, query, limit_per_source) for name, fn in SOURCES]
        for fut in as_completed(futures):
            name, rows, err, sample = fut.result()
            results.extend(rows)
            entry = {"store": name, "ok": err is None, "count": len(rows)}
            if err:
                entry["error"] = err
            if debug:
                entry["sample"] = sample or (err or "")
            status[name] = entry

    sources = [status[name] for name, _ in SOURCES if name in status]
    results.sort(key=lambda r: (r.get("price") is None, r.get("price") or 0))
    return {"results": results, "sources": sources}
