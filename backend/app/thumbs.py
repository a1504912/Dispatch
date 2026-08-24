"""產生小縮圖：把大張的 data URL 壓成很小的 JPEG，給總覽/看板列表用。

列表只傳這個小縮圖，原圖等使用者點開行程才載，讀取就快很多。
"""

import base64
import io
import json
from typing import Optional

from PIL import Image


def _first_image(image: Optional[str], images: Optional[str]) -> Optional[str]:
    """從 image / images(JSON 陣列) 取第一張 data URL。"""
    if images:
        try:
            arr = json.loads(images)
            if isinstance(arr, list) and arr:
                return arr[0]
        except (ValueError, TypeError):
            pass
    return image or None


def make_thumb(data_url: Optional[str], size: int = 240, quality: int = 55) -> Optional[str]:
    """把一張 data URL 縮成 <=size 的小 JPEG data URL；失敗回 None。"""
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return None
    try:
        _, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((size, size))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception:  # noqa: BLE001
        return None


def thumb_for(image: Optional[str], images: Optional[str]) -> Optional[str]:
    """依 event 的 image/images 產生縮圖。"""
    return make_thumb(_first_image(image, images))
