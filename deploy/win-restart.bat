@echo off
rem Dispatch one-click update + restart (Windows).
rem
rem KEEP THIS FILE ASCII-ONLY. cmd.exe reads .bat files using the system code
rem page (Big5 on Traditional Chinese Windows). UTF-8 Chinese text in a .bat
rem can swallow quotes and break commands.
rem
rem Double-click (no args): copy this script to %TEMP% and run the copy, so that
rem "git pull" cannot rewrite the script while it is running.
rem Web "Update now" passes %1=repo path and runs the normal flow directly.

if "%~1"=="" (
  copy /y "%~f0" "%TEMP%\dispatch-update.bat" >nul
  start "Dispatch Update" "%TEMP%\dispatch-update.bat" "%~dp0.." manual
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
rem Headless browser used by the e-invoice feature (fast no-op if installed)
python -m playwright install chromium

echo restart>"%ST%"
echo == Stopping old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
rem Give the OS a moment to release port 8000
timeout /t 2 >nul

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
uvicorn app.main:app --host 0.0.0.0 --port 8000

rem Reaching here means the server stopped or FAILED TO START.
rem When run by hand, stop so the error above stays visible.
if /i "%MANUAL%"=="manual" (
  echo.
  echo ============================================================
  echo  Server stopped or failed to start. Any red text above is the reason.
  echo  Common causes: port 8000 still in use, venv missing, git pull conflict.
  echo  Take a screenshot of this window, then press any key to close.
  echo ============================================================
  pause >nul
)
