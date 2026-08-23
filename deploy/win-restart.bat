@echo off
rem Dispatch one-click: update + restart (Windows)
rem   1) pull latest code  2) build frontend  3) sync backend deps
rem   4) stop the old server on port 8000  5) start fresh in this window
cd /d "%~dp0.."

echo == Pulling latest code ==
git pull origin claude/clever-cray-o05a2o

echo == Building frontend ==
cd frontend
call npm install
call npm run build

echo == Updating backend packages ==
cd ..\backend
call .venv\Scripts\activate.bat
pip install -r requirements.txt

echo == Stopping old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
