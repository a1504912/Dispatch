import asyncio
import re
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/news", tags=["news"])

# 中央社 CNA RSS（連結直達文章，封面圖抓得到）
_CNA = "https://feeds.feedburner.com/rsscna"
TOPICS = {
    "top": f"{_CNA}/realtimenews",
    "nation": f"{_CNA}/politics",
    "world": f"{_CNA}/intworld",
    "business": f"{_CNA}/finance",
    "technology": f"{_CNA}/technology",
    "sports": f"{_CNA}/sport",
    "entertainment": f"{_CNA}/entertainment",
}

MAX_ITEMS = 20
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
_img_in_desc = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)
_og_patterns = [
    re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', re.I),
]
_img_cache: dict[str, str] = {}


def _image_from_item(item, description: str) -> str:
    """先從 RSS 內容找圖：enclosure / media / description 裡的 <img>。"""
    enc = item.find("enclosure")
    if enc is not None and (enc.get("type") or "").startswith("image") and enc.get("url"):
        return enc.get("url")
    for child in item:
        tag = child.tag.lower()
        if ("thumbnail" in tag or "content" in tag) and child.get("url"):
            t = child.get("type") or ""
            if t.startswith("image") or re.search(r"\.(jpe?g|png|webp)", child.get("url"), re.I):
                return child.get("url")
    m = _img_in_desc.search(description or "")
    return m.group(1) if m else ""


async def _fetch_og_image(client: httpx.AsyncClient, link: str) -> str:
    if link in _img_cache:
        return _img_cache[link]
    try:
        resp = await client.get(link, headers={"User-Agent": _UA}, timeout=6.0)
        html = resp.text[:200_000]
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
        desc = item.findtext("description") or ""
        if not (title and link):
            continue
        items.append(
            {
                "title": title,
                "link": link,
                "source": "中央社",
                "published": pub,
                "image": _image_from_item(item, desc),
            }
        )
        if len(items) >= MAX_ITEMS:
            break

    # RSS 裡沒圖的，去文章頁抓 og:image（連結是直達文章，抓得到）
    missing = [it for it in items if not it["image"]]
    if missing:
        sem = asyncio.Semaphore(10)
        async with httpx.AsyncClient(follow_redirects=True) as client:

            async def enrich(it):
                async with sem:
                    it["image"] = await _fetch_og_image(client, it["link"])

            await asyncio.gather(*(enrich(it) for it in missing))

    return {"items": items}
