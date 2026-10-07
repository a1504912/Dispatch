"""台灣國定假日 / 補假 / 補班（政府行政機關辦公日曆表）。

資料來源：ruyut/TaiwanCalendar（整理自行政院人事行政總處公告的開放資料），免金鑰。
- 抓到的年份存在 data/holidays/{年}.json，7 天內不重抓（人事總處偶爾會修正）
- 抓不到時用內建的 app/tw_holidays.json，再不行就回空清單（行事曆照常顯示）
只回「特別的日子」：平日放假、有名字的週末節日、週末補班；一般週末不回。
"""

import datetime as dt
import json
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/holidays", tags=["holidays"])

_SOURCES = [
    "https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/{y}.json",
    "https://raw.githubusercontent.com/ruyut/TaiwanCalendar/master/data/{y}.json",
]
_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "holidays"
_BUNDLED = Path(__file__).resolve().parent.parent / "tw_holidays.json"
_TTL = 7 * 86400
_RETRY = 3600  # 抓失敗後 1 小時內不再重試，避免每次開行事曆都卡在逾時
_mem: dict[int, tuple[float, dict]] = {}
_failed: dict[int, float] = {}


def _normalize(rows) -> dict:
    """原始逐日資料 → {"YYYY-MM-DD": ["off"|"work", 名稱]}（只留特別的日子）"""
    days = {}
    for r in rows if isinstance(rows, list) else []:
        try:
            d = dt.datetime.strptime(str(r["date"]), "%Y%m%d").date()
        except (KeyError, ValueError):
            continue
        weekend = d.weekday() >= 5
        name = (r.get("description") or "").strip()
        if r.get("isHoliday") and (not weekend or name):
            days[d.isoformat()] = ["off", name or "放假"]
        elif not r.get("isHoliday") and weekend:
            days[d.isoformat()] = ["work", name or "補行上班"]
    return days


def _bundled(year: int) -> dict | None:
    try:
        return json.loads(_BUNDLED.read_text(encoding="utf-8")).get(str(year))
    except (OSError, ValueError):
        return None


def _fetch(year: int) -> dict | None:
    for url in _SOURCES:
        try:
            with httpx.Client(timeout=8, follow_redirects=True) as client:
                resp = client.get(url.format(y=year), headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                continue
            days = _normalize(resp.json())
            if days:
                return days
        except (httpx.HTTPError, ValueError):
            continue
    return None


def year_days(year: int) -> dict:
    now = time.time()
    hit = _mem.get(year)
    if hit and now - hit[0] < _TTL:
        return hit[1]

    path = _CACHE_DIR / f"{year}.json"
    cached = None
    if path.exists():
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
            if now - path.stat().st_mtime < _TTL:
                _mem[year] = (path.stat().st_mtime, cached)
                return cached
        except (OSError, ValueError):
            cached = None

    fresh = None
    if now - _failed.get(year, 0) > _RETRY:
        fresh = _fetch(year)
    if fresh:
        try:
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(fresh, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass
        _mem[year] = (now, fresh)
        return fresh

    _failed[year] = now
    days = cached or _bundled(year) or {}
    # 失敗時先記住舊資料，1 小時後再試抓新的
    _mem[year] = (now - _TTL + _RETRY, days)
    return days


@router.get("")
def list_holidays(start: str, end: str):
    """回傳 [start, end] 區間內的假日 / 補班：[{date, type: off|work, name}]"""
    try:
        s, e = dt.date.fromisoformat(start[:10]), dt.date.fromisoformat(end[:10])
    except ValueError:
        raise HTTPException(400, "日期格式應為 YYYY-MM-DD")
    if e < s or (e - s).days > 800:
        raise HTTPException(400, "日期區間不正確")
    out = []
    for y in range(s.year, e.year + 1):
        for d, (kind, name) in year_days(y).items():
            if start[:10] <= d <= end[:10]:
                out.append({"date": d, "type": kind, "name": name})
    out.sort(key=lambda x: x["date"])
    return out
