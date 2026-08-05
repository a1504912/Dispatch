import asyncio
import re
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/news", tags=["news"])

_BASE = "https://news.google.com/rss"
_SUFFIX = "hl=zh-TW&gl=TW&ceid=TW:zh-Hant"

TOPICS = {
    "top": f"{_BASE}?{_SUFFIX}",
    "nation": f"{_BASE}/headlines/section/topic/NATION?{_SUFFIX}",
    "world": f"{_BASE}/headlines/section/topic/WORLD?{_SUFFIX}",
    "business": f"{_BASE}/headlines/section/topic/BUSINESS?{_SUFFIX}",
    "technology": f"{_BASE}/headlines/section/topic/TECHNOLOGY?{_SUFFIX}",
    "sports": f"{_BASE}/headlines/section/topic/SPORTS?{_SUFFIX}",
    "entertainment": f"{_BASE}/headlines/section/topic/ENTERTAINMENT?{_SUFFIX}",
}

MAX_ITEMS = 20
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
_og_patterns = [
    re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', re.I),
]

# 簡單的圖片快取：連結 → 圖片網址（避免重複抓）
_img_cache: dict[str, str] = {}


async def _fetch_image(client: httpx.AsyncClient, link: str) -> str:
    if link in _img_cache:
        return _img_cache[link]
    try:
        resp = await client.get(link, headers={"User-Agent": _UA}, timeout=6.0)
        html = resp.text[:200_000]  # 只看前段（og:image 在 <head>）
        for pat in _og_patterns:
            m = pat.search(html)
            if m:
                _img_cache[link] = m.group(1)
                return m.group(1)
    except httpx.HTTPError:
        pass
    _img_cache[link] = ""
    return ""


@router.get("")
async def get_news(topic: str = "top"):
    url = TOPICS.get(topic, TOPICS["top"])
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": _UA})
            resp.raise_for_status()
            root = ET.fromstring(resp.text)
    except (httpx.HTTPError, ET.ParseError):
        return {"items": []}

    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else ""
        if source and title.endswith(f" - {source}"):
            title = title[: -(len(source) + 3)]
        if title and link:
            items.append({"title": title, "link": link, "source": source, "published": pub, "image": ""})
        if len(items) >= MAX_ITEMS:
            break

    # 並行抓封面圖（最多同時 10 個）
    sem = asyncio.Semaphore(10)
    async with httpx.AsyncClient(follow_redirects=True) as client:

        async def enrich(it):
            async with sem:
                it["image"] = await _fetch_image(client, it["link"])

        await asyncio.gather(*(enrich(it) for it in items))

    return {"items": items}
