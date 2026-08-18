import time

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/games", tags=["games"])

# GamerPower：彙整 Epic / Steam / GOG 等平台的免費遊戲，免金鑰
_URL = "https://www.gamerpower.com/api/giveaways?type=game&sort-by=popularity"
_TTL = 1800  # 快取 30 分鐘（等於每 30 分更新一次）
_cache = {"ts": 0.0, "data": []}


@router.get("")
async def get_games():
    now = time.time()
    if _cache["data"] and now - _cache["ts"] < _TTL:
        return {"games": _cache["data"], "cached": True}

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(_URL, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        return {"games": _cache["data"], "cached": True}  # 失敗回舊快取

    games = []
    for g in data if isinstance(data, list) else []:
        games.append(
            {
                "id": g.get("id"),
                "title": g.get("title") or "",
                "worth": g.get("worth") or "",
                "image": g.get("image") or g.get("thumbnail") or "",
                "description": g.get("description") or "",
                "platforms": g.get("platforms") or "",
                "end_date": g.get("end_date") or "",
                "url": g.get("open_giveaway_url") or g.get("gamerpower_url") or "",
            }
        )
    _cache.update(ts=now, data=games)
    return {"games": games, "cached": False}
