"""小型個人偏好設定（存在主機資料庫，手機、電腦共用）。只開放白名單裡的 key。"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.database import get_session
from app.push import get_setting, set_setting

router = APIRouter(prefix="/api/prefs", tags=["prefs"])

# key → 預設值
ALLOWED = {
    # 新增行程的常用時段：[{"label": "午休", "start": "12:00", "end": "13:00"}]
    "event_time_presets": [{"label": "中午", "start": "12:00", "end": "13:00"}],
}
MAX_LEN = 20000


def _check(key: str):
    if key not in ALLOWED:
        raise HTTPException(404, "沒有這個設定")


@router.get("/{key}")
def get_pref(key: str, session: Session = Depends(get_session)):
    _check(key)
    raw = get_setting(session, f"pref_{key}", "")
    if not raw:
        return {"value": ALLOWED[key]}
    try:
        return {"value": json.loads(raw)}
    except ValueError:
        return {"value": ALLOWED[key]}


class PrefIn(BaseModel):
    value: object


@router.put("/{key}")
def put_pref(key: str, payload: PrefIn, session: Session = Depends(get_session)):
    _check(key)
    raw = json.dumps(payload.value, ensure_ascii=False)
    if len(raw) > MAX_LEN:
        raise HTTPException(400, "設定內容太長")
    set_setting(session, f"pref_{key}", raw)
    return {"value": payload.value}
