import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])

# 專案根目錄下的 deploy/win-restart.bat
BAT = Path(__file__).resolve().parents[3] / "deploy" / "win-restart.bat"


@router.get("/update-available")
def update_available():
    """這台主機是否支援網頁一鍵更新。"""
    return {
        "supported": settings.allow_self_update and sys.platform.startswith("win") and BAT.exists(),
        "windows": sys.platform.startswith("win"),
    }


@router.post("/update")
def run_update():
    """在背景執行 win-restart.bat：拉新程式 → 重建前端 → 重啟後端。"""
    if not settings.allow_self_update:
        raise HTTPException(status_code=403, detail="自我更新已停用（.env 設 ALLOW_SELF_UPDATE=0）")
    if not sys.platform.startswith("win"):
        raise HTTPException(status_code=400, detail="此功能只在自架 Windows 主機可用")
    if not BAT.exists():
        raise HTTPException(status_code=400, detail="找不到 win-restart.bat")

    # 用 start 另開一個獨立視窗執行；這樣它 taskkill 掉舊後端後，更新程序仍存活並啟動新後端。
    try:
        subprocess.Popen(
            f'start "" cmd /c "{BAT}"',
            cwd=str(BAT.parent),
            shell=True,
            close_fds=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"啟動更新失敗：{exc}") from exc

    return {"ok": True, "message": "主機更新中，約 1–2 分鐘後完成，請稍後重新整理頁面。"}
