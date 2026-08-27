@echo off
rem Dispatch one-click: update + restart (Windows)
rem   %1 (optional) = repo root. When the web UI triggers an update it copies this
rem   script to %TEMP% and passes the repo path, so "git pull" never modifies the
rem   script that is currently running. Writes each step to update-status.txt for
rem   the progress bar. No "pause" -> the window closes when the server stops,
rem   so old windows don't pile up after each update.
if "%~1"=="" ( set "REPO=%~dp0.." ) else ( set "REPO=%~1" )
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

echo restart>"%ST%"
echo == Stopping old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
uvicorn app.main:app --host 0.0.0.0 --port 8000
