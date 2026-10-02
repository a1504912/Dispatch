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
from urllib.parse import quote

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


def _check(resp):
    """非 2xx 時丟出含回應內容的錯誤，方便看出被擋原因或缺哪些欄位。"""
    if resp.status_code >= 400:
        body = (resp.text or "")[:300].replace("\n", " ")
        raise RuntimeError(f"HTTP {resp.status_code}: {body}")


def _snip(resp, extra: str = "") -> str:
    """把一次回應濃縮成短診斷字串。"""
    try:
        body = resp.text[:400].replace("\n", " ")
    except Exception:  # noqa: BLE001
        body = "<無法讀取內容>"
    return f"HTTP {resp.status_code} {extra}｜{body}"


# ---------- PChome（新品；抓多頁） ----------

PCHOME_URL = "https://ecshweb.pchome.com.tw/search/v3.3/all/results"


def _search_pchome(query: str, limit: int, min_price=None, max_price=None):
    headers = {"User-Agent": _UA, "Referer": "https://ecshweb.pchome.com.tw/", "Accept": "application/json"}
    # 有設價位就用價格排序，翻頁時能提早停；否則用熱銷排序
    if max_price is not None:
        sort = "price/ac"  # 便宜→貴
    elif min_price is not None:
        sort = "price/dc"  # 貴→便宜
    else:
        sort = "sale/dc"
    out: list[dict] = []
    sample = ""
    MAX_PAGES = 15
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        for page in range(1, MAX_PAGES + 1):
            resp = client.get(PCHOME_URL, params={"q": query, "page": page, "sort": sort})
            _check(resp)
            data = resp.json()
            if page == 1:
                sample = _snip(resp, f"totalPage={data.get('totalPage')} sort={sort}")
            prods = data.get("prods") or []
            if not prods:
                break
            stop = False
            for p in prods:
                name = (p.get("name") or "").strip()
                price = _num(p.get("price"))
                if not name or price is None:
                    continue
                if min_price is not None and price < min_price:
                    if sort == "price/dc":  # 貴→便宜，之後只會更小 → 停
                        stop = True
                        break
                    continue
                if max_price is not None and price > max_price:
                    if sort == "price/ac":  # 便宜→貴，之後只會更大 → 停
                        stop = True
                        break
                    continue
                pid = (p.get("Id") or "").strip()
                pic = (p.get("picS") or p.get("picB") or "").strip()
                image = f"https://cs-a.ecimg.tw{pic}" if pic.startswith("/") else (pic or None)
                out.append(
                    {
                        "title": name,
                        "price": price,
                        "url": f"https://24h.pchome.com.tw/prod/{pid}" if pid else "",
                        "store": "PChome",
                        "image": image,
                        "condition": "new",
                    }
                )
                if len(out) >= limit:
                    stop = True
                    break
            if stop or page >= (data.get("totalPage") or 1):
                break
    return out[:limit], sample


# ---------- momo 購物網（新品；HTML 解析） ----------

MOMO_URL = "https://www.momoshop.com.tw/search/searchShop.jsp"


def _search_momo(query: str, limit: int, min_price=None, max_price=None):
    headers = {
        "User-Agent": _UA,
        "Referer": "https://www.momoshop.com.tw/",
        "Accept": "text/html,application/xhtml+xml",
    }
    out: list[dict] = []
    seen: set[str] = set()
    sample = ""
    MAX_PAGES = 6
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        for page in range(1, MAX_PAGES + 1):
            params = {"keyword": query, "searchType": "1", "curPage": str(page), "_isFuzzy": "0"}
            resp = client.get(MOMO_URL, params=params)
            _check(resp)
            html = resp.text
            # momo 為 Next.js：商品資料藏在 RSC 串流 JSON（引號被跳脫）→ 先還原再比對
            text = html.replace('\\"', '"').replace("\\u002F", "/").replace("\\/", "/")
            if page == 1:
                sample = (
                    f"len={len(html)} goodsCode={'goodsCode' in text} goodsName={'goodsName' in text} "
                    f"next_f={'__next_f' in html}"
                )
            found = 0
            for m in re.finditer(r'"goodsCode":"?(\d{5,})"?', text):
                code = m.group(1)
                if code in seen:
                    continue
                seen.add(code)
                found += 1
                win = text[m.start(): m.start() + 1500]
                name_m = re.search(r'"goodsName":"([^"]+)"', win)
                price_m = (
                    re.search(r'"goodsPrice":"?([\d,]+)"?', win)
                    or re.search(r'"salePrice":"?([\d,]+)"?', win)
                    or re.search(r'"price":"?([\d,]+)"?', win)
                )
                img_m = re.search(r'"(?:imgUrl|goodsImg|imageUrl)":"([^"]+\.(?:jpg|png|webp)[^"]*)"', win)
                name = name_m.group(1).strip() if name_m else ""
                price = _num(price_m.group(1)) if price_m else None
                if not name or price is None:
                    continue
                if min_price is not None and price < min_price:
                    continue
                if max_price is not None and price > max_price:
                    continue
                image = img_m.group(1) if img_m else None
                if image and image.startswith("//"):
                    image = "https:" + image
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
            if len(out) >= limit or found == 0:
                break
    return out, sample


# ---------- 蝦皮購物 Shopee（JSON API） ----------

SHOPEE_URL = "https://shopee.tw/api/v4/search/search_items"


def _search_shopee(query: str, limit: int, min_price=None, max_price=None):
    headers = {
        "User-Agent": _UA,
        "Referer": f"https://shopee.tw/search?keyword={quote(query)}",
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
    with httpx.Client(timeout=12.0, headers={"User-Agent": _UA}, follow_redirects=True) as client:
        try:  # 先逛一下首頁拿 cookie，可能繞過基本擋爬
            client.get("https://shopee.tw/", timeout=8.0)
        except Exception:  # noqa: BLE001
            pass
        resp = client.get(SHOPEE_URL, params=params, headers=headers)
        _check(resp)
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


def _search_ruten(query: str, limit: int, min_price=None, max_price=None):
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

    if isinstance(items, dict):
        items = items.get("data") or items.get("Rows") or []

    out: list[dict] = []
    for it in items or []:
        name = (it.get("name") or it.get("ProdName") or it.get("Name") or "").strip()
        pid = str(it.get("id") or it.get("Id") or it.get("GoodsNo") or "").strip()
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
    # 診斷：把第一筆的欄位名列出來，方便鎖定價格/圖片欄位
    keys = ",".join((items[0].keys())) if items and isinstance(items[0], dict) else "無資料"
    sample = f"ids={len(ids)} keys=[{keys}]"
    return out, sample


def _ruten_price(it: dict):
    pr = it.get("PriceRange") or it.get("price_range")
    if isinstance(pr, (list, tuple)) and pr:
        return _num(pr[0])
    if isinstance(pr, dict):  # 有時是 {"min":.., "max":..}
        return _num(pr.get("min") or pr.get("Min"))
    for key in (
        "price", "Price", "direct_price", "DirectPrice",
        "goods_price", "GoodsPrice", "sale_price", "min_price", "sell_price",
    ):
        if it.get(key) is not None:
            n = _num(it.get(key))
            if n is not None:
                return n
    return None


def _ruten_image(it: dict):
    # 新版：images 物件，filename 為逗號分隔檔名
    imgs = it.get("images")
    if isinstance(imgs, dict):
        fn = str(imgs.get("filename") or "").split(",")[0].strip()
        if fn:
            return f"https://gcs.rimg.com.tw/{fn}"
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


def _search_carousell(query: str, limit: int, min_price=None, max_price=None):
    headers = {
        "User-Agent": _UA,
        "Referer": f"https://tw.carousell.com/search/{quote(query)}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    # 價位帶進 filters（rangedFilter），server 端就先幫我們篩
    filters = []
    if min_price is not None or max_price is not None:
        filters.append(
            {
                "rangedFilter": {
                    "fieldName": "price",
                    "range": {
                        "start": {"value": str(int(min_price))} if min_price is not None else None,
                        "end": {"value": str(int(max_price))} if max_price is not None else None,
                    },
                }
            }
        )
    body = {
        "count": limit,
        "query": query,
        "filters": filters,
        "locale": "zh-TW",
        "sortParam": {"fieldName": "relevance"},
        "prefill": {},
        "countryId": "1880251",  # 台灣（若不對，422 回應會告訴我們正確值）
        "countryCollectionMethod": "DEVICE_LOCATION",
    }
    with httpx.Client(timeout=12.0, headers=headers, follow_redirects=True) as client:
        resp = client.post(CAROUSELL_URL, json=body)
        _check(resp)
        data = resp.json()
    sample = _snip(resp)

    results = (data.get("data") or data).get("results") or data.get("results") or []
    out: list[dict] = []
    for r in results:
        card = r.get("listingCard") or r
        pid = str(card.get("id") or "").strip()
        title = _carousell_text(card, ("title",))
        price = _carousell_price(card)
        image = _carousell_image(card)
        if not title or price is None:
            continue
        if min_price is not None and price < min_price:
            continue
        if max_price is not None and price > max_price:
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
        if len(out) >= limit:
            break
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

# 目前啟用的來源。蝦皮(403 擋爬)、露天(結果太雜)暫時停用，函式保留以便日後再開。
SOURCES = [
    ("PChome", _search_pchome),
    ("momo", _search_momo),
    ("旋轉拍賣", _search_carousell),
]


def _run_one(name, fn, query, limit, min_price, max_price):
    try:
        rows, sample = fn(query, limit, min_price, max_price)
        return name, rows, None, sample
    except Exception as exc:  # noqa: BLE001
        return name, [], f"{type(exc).__name__}: {exc}"[:250], ""


def search(query: str, limit_per_source: int = 60, min_price=None, max_price=None, debug: bool = False) -> dict:
    """依關鍵字上網查目前報價，平行彙整多家來源。

    有給 min_price/max_price 時，各家會針對價位區間去翻頁抓，湊滿數量再回傳（而非只篩眼前結果）。
    回傳 {results, sources}；results 依價格由低到高排序。每個 source 含 store/ok/count，
    失敗時含 error；debug=True 時另含 sample（原始回傳片段）方便對照修正。
    """
    query = (query or "").strip()
    if not query:
        return {"results": [], "sources": []}

    results: list[dict] = []
    status: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        futures = [
            pool.submit(_run_one, name, fn, query, limit_per_source, min_price, max_price)
            for name, fn in SOURCES
        ]
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
