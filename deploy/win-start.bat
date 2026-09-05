@echo off
rem Dispatch 開機/登入自動啟動：重掛 Tailscale Funnel + 啟動後端伺服器。
rem 不做 git pull（那是 win-restart.bat 的事）；這支只負責「把服務拉起來」。
rem 由 win-autostart-setup.bat 註冊成登入時自動執行。

set "REPO=%~dp0.."
rem 確保找得到 tailscale（預設安裝路徑；已在 PATH 就無妨）
set "PATH=%PATH%;C:\Program Files\Tailscale"
cd /d "%REPO%"

echo == Re-arming Tailscale Funnel (clean re-mount) ==
tailscale serve reset
tailscale funnel --bg 8000

echo == Stopping any old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
cd /d "%REPO%\backend"
call .venv\Scripts\activate.bat
uvicorn app.main:app --host 0.0.0.0 --port 8000
