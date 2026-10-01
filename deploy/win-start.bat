@echo off
rem Dispatch start at boot/login: re-arm Tailscale Funnel + start the backend.
rem No git pull here (that is win-restart.bat's job); this only brings services up.
rem Registered by win-autostart-setup.bat to run at login.
rem KEEP THIS FILE ASCII-ONLY (see win-restart.bat for why).

set "REPO=%~dp0.."
rem Make sure tailscale is found (default install path; harmless if already in PATH)
set "PATH=%PATH%;C:\Program Files\Tailscale"
cd /d "%REPO%"

echo == Re-arming Tailscale Funnel (clean re-mount) ==
tailscale serve reset
tailscale funnel --bg 8000

echo == Stopping any old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 >nul

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
cd /d "%REPO%\backend"
call .venv\Scripts\activate.bat
uvicorn app.main:app --host 0.0.0.0 --port 8000

echo.
echo ============================================================
echo  Server stopped or failed to start. Any red text above is the reason.
echo  Take a screenshot of this window, then press any key to close.
echo ============================================================
pause >nul
