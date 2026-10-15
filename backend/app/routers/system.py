import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

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
        # 一律用 UTF-8 讀 git 輸出（Windows 預設 cp950 會把中文的 commit 訊息讀成亂碼）
        r = subprocess.run(
            ["git", "-c", "i18n.logOutputEncoding=utf-8", "-c", "core.quotepath=false", *args],
            cwd=str(REPO), capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=timeout,
        )
        if r.returncode != 0:
            return None
        return r.stdout.strip()
    except Exception:  # noqa: BLE001
        return None


_F, _R = "\x1f", "\x1e"
_TRAILER = re.compile(r"^(Co-Authored-By|Claude-Session|Signed-off-by|Change-Id):", re.I)


def _points(body: str) -> list[str]:
    """把 commit 內文整理成條列：「- 」開頭是一點，續行接在上一點後面，空行分段；簽名行略過。"""
    pts: list[str] = []
    new_para = True
    for raw in (body or "").splitlines():
        txt = raw.strip()
        if not txt:
            new_para = True
            continue
        if _TRAILER.match(txt):
            continue
        if txt[:2] in ("- ", "* ") or txt.startswith(("・", "•")):
            pts.append(txt.lstrip("-*・• ").strip())
        elif pts and not new_para:
            glue = "" if (pts[-1][-1:] > "\x7f" or txt[:1] > "\x7f") else " "
            pts[-1] += glue + txt
        else:
            pts.append(txt)
        new_para = False
    return pts[:12]


def _commits(rev_range: str, limit: int = 30) -> list[dict]:
    out = _git(["log", f"--max-count={limit}", "--no-merges",
                f"--pretty=%h{_F}%s{_F}%b{_F}%cd{_R}", "--date=format:%Y-%m-%d %H:%M", rev_range], timeout=15)
    commits = []
    for rec in (out or "").split(_R):
        parts = rec.strip("\n").split(_F)
        if len(parts) < 4 or not parts[0].strip():
            continue
        h, subject, body, date = (p.strip() for p in parts[:4])
        commits.append({"hash": h, "subject": subject, "points": _points(body), "date": date})
    return commits


@router.get("/changelog")
def changelog(since: str = Query(..., min_length=4, max_length=40)):
    """從某個版本（since）到目前主機版本之間的更新內容。"""
    if not re.fullmatch(r"[0-9a-fA-F]{4,40}", since):
        raise HTTPException(400, "版本代號格式不對")
    if _git(["cat-file", "-e", f"{since}^{{commit}}"]) is None:
        return {"ok": False, "commits": []}  # 舊版本不在這台主機的歷史裡（例如換過分支）
    if _git(["merge-base", "--is-ancestor", since, "HEAD"]) is None:
        return {"ok": False, "commits": []}
    return {"ok": True, "commits": _commits(f"{since}..HEAD", 40)}


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
    commits = _commits(f"HEAD..origin/{branch}", 30) if n > 0 else []
    return {"ok": True, "behind": n, "latest_subject": latest, "commits": commits}


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
