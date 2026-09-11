import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])

# 專案根目錄
REPO = Path(__file__).resolve().parents[3]
BAT = REPO / "deploy" / "win-restart.bat"
STATUS = REPO / "deploy" / "update-status.txt"
# 每次後端啟動就換一個；前端看到它變了＝後端已重啟完成
BOOT_ID = uuid.uuid4().hex


@router.get("/update-status")
def update_status():
    """更新到哪一步（win-restart.bat 會寫這個檔）＋ 這次的開機 ID。"""
    try:
        step = STATUS.read_text(encoding="utf-8").strip()
    except Exception:  # noqa: BLE001
        step = ""
    return {"step": step, "boot": BOOT_ID}


def _git(args, timeout=10):
    try:
        r = subprocess.run(
            ["git", *args], cwd=str(REPO), capture_output=True, text=True, timeout=timeout
        )
        if r.returncode != 0:
            return None
        return r.stdout.strip()
    except Exception:  # noqa: BLE001
        return None


@router.get("/version")
def version():
    """目前主機上的程式版本（讀本地 git）。"""
    return {
        "commit": _git(["rev-parse", "--short", "HEAD"]),
        "subject": _git(["log", "-1", "--pretty=%s"]),
        "date": _git(["log", "-1", "--pretty=%cd", "--date=format:%Y-%m-%d %H:%M"]),
        "branch": _git(["rev-parse", "--abbrev-ref", "HEAD"]),
    }


@router.post("/check-updates")
def check_updates():
    """向遠端抓一下，看落後幾個版本（有沒有新版可更新）。"""
    branch = _git(["rev-parse", "--abbrev-ref", "HEAD"]) or "HEAD"
    fetched = _git(["fetch", "origin", branch], timeout=30) is not None
    if not fetched:
        return {"ok": False, "detail": "無法連到 GitHub 檢查更新"}
    behind = _git(["rev-list", "--count", f"HEAD..origin/{branch}"])
    latest = _git(["log", "-1", "--pretty=%s", f"origin/{branch}"])
    try:
        n = int(behind or "0")
    except ValueError:
        n = 0
    return {"ok": True, "behind": n, "latest_subject": latest}


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

    try:
        STATUS.write_text("start", encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    # 複製一份到暫存再執行，並把 repo 路徑當參數傳進去：
    #   - git pull 不會動到「正在執行」的腳本
    #   - 用新的 console 視窗跑，taskkill 掉舊後端後這個更新程序仍存活並啟動新後端
    try:
        tmp = Path(tempfile.gettempdir()) / "dispatch-update.bat"
        shutil.copyfile(BAT, tmp)
        subprocess.Popen(
            [str(tmp), str(REPO)],
            cwd=str(REPO),
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
            close_fds=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"啟動更新失敗：{exc}") from exc

    return {"ok": True, "message": "主機更新中，約 1–2 分鐘後完成，請稍後重新整理頁面。"}
