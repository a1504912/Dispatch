"""比價：上網抓真實商品報價（不需要 AI、不用付費）。

目前來源：PChome 線上購物的搜尋 API（回傳 JSON，速度快、不用開瀏覽器）。
之後要加別家（momo、Google 購物…）就在這裡多寫一個 _search_xxx 併進 search()。

注意：這支是設計成跑在「自架主機」上（住宅 IP、可正常對外連線）。在受限的雲端
環境可能連不出去，屬正常。
"""

import httpx

PCHOME_URL = "https://ecshweb.pchome.com.tw/search/v3.3/all/results"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Referer": "https://ecshweb.pchome.com.tw/",
    "Accept": "application/json, text/plain, */*",
}


def _search_pchome(query: str, limit: int) -> list[dict]:
    """查 PChome，回傳 [{title, price, url, store, image}]。"""
    params = {"q": query, "page": 1, "sort": "sale/dc"}
    with httpx.Client(timeout=15.0, headers=_HEADERS, follow_redirects=True) as client:
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
        image = f"https://cs-a.ecimg.tw{pic}" if pic.startswith("/") else pic
        out.append(
            {
                "title": name,
                "price": price,
                "url": f"https://24h.pchome.com.tw/prod/{pid}" if pid else "",
                "store": "PChome",
                "image": image or None,
            }
        )
    return out


def search(query: str, limit: int = 12) -> list[dict]:
    """依關鍵字上網查目前報價；目前只查 PChome。"""
    query = (query or "").strip()
    if not query:
        return []
    return _search_pchome(query, limit)
