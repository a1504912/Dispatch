@echo off
rem Dispatch 一鍵更新 + 重啟（Windows）
rem 直接雙擊執行時：先把自己複製到暫存再跑，避免 git pull 改寫「正在執行的腳本」
rem 導致 cmd 找不到位置、視窗直接關閉。網頁「立即更新」會帶 %1=repo 進來，走正常流程。

if "%~1"=="" (
  copy /y "%~f0" "%TEMP%\dispatch-update.bat" >nul
  start "Dispatch 更新" "%TEMP%\dispatch-update.bat" "%~dp0.." manual
  exit /b
)

set "REPO=%~1"
set "MANUAL=%~2"
set "ST=%REPO%\deploy\update-status.txt"
cd /d "%REPO%"

echo pull>"%ST%"
echo == Pulling latest code ==
git pull origin claude/clever-cray-o05a2o

echo build>"%ST%"
echo == Building frontend ==
cd /d "%REPO%\frontend"
call npm install
call npm run build

echo deps>"%ST%"
echo == Updating backend packages ==
cd /d "%REPO%\backend"
call .venv\Scripts\activate.bat
pip install -r requirements.txt
rem 發票功能需要的隱形瀏覽器（已裝過會很快略過）
python -m playwright install chromium

echo restart>"%ST%"
echo == Stopping old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
rem 等一下讓 8000 埠確實釋放，避免新伺服器搶不到埠而秒退
timeout /t 2 >nul

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
uvicorn app.main:app --host 0.0.0.0 --port 8000

rem 跑到這裡＝伺服器已停止或「啟動失敗」。手動執行時停住，讓你看得到上面的錯誤原因。
if /i "%MANUAL%"=="manual" (
  echo.
  echo ============================================================
  echo  伺服器已停止或啟動失敗。若上面有紅字，那就是原因。
  echo  常見：8000 埠還被占用、venv 沒建好、git pull 有衝突。
  echo  按任意鍵關閉這個視窗...
  echo ============================================================
  pause >nul
)
