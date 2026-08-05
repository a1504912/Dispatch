import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/news", tags=["news"])

_BASE = "https://news.google.com/rss"
_SUFFIX = "hl=zh-TW&gl=TW&ceid=TW:zh-Hant"

# 分類 → Google 新聞 RSS 網址
TOPICS = {
    "top": f"{_BASE}?{_SUFFIX}",
    "nation": f"{_BASE}/headlines/section/topic/NATION?{_SUFFIX}",
    "world": f"{_BASE}/headlines/section/topic/WORLD?{_SUFFIX}",
    "business": f"{_BASE}/headlines/section/topic/BUSINESS?{_SUFFIX}",
    "technology": f"{_BASE}/headlines/section/topic/TECHNOLOGY?{_SUFFIX}",
    "sports": f"{_BASE}/headlines/section/topic/SPORTS?{_SUFFIX}",
    "entertainment": f"{_BASE}/headlines/section/topic/ENTERTAINMENT?{_SUFFIX}",
}


@router.get("")
async def get_news(topic: str = "top"):
    url = TOPICS.get(topic, TOPICS["top"])
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
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
        # Google 新聞標題常是「標題 - 媒體」，把尾巴的來源去掉讓標題乾淨
        if source and title.endswith(f" - {source}"):
            title = title[: -(len(source) + 3)]
        if title and link:
            items.append({"title": title, "link": link, "source": source, "published": pub})
        if len(items) >= 40:
            break
    return {"items": items}
