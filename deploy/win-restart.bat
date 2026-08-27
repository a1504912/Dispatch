@echo off
rem Dispatch one-click: update + restart (Windows)
rem   writes each step to update-status.txt so the web UI can show a progress bar
set ST=%~dp0update-status.txt
cd /d "%~dp0.."

echo pull>"%ST%"
echo == Pulling latest code ==
git pull origin claude/clever-cray-o05a2o

echo build>"%ST%"
echo == Building frontend ==
cd frontend
call npm install
call npm run build

echo deps>"%ST%"
echo == Updating backend packages ==
cd ..\backend
call .venv\Scripts\activate.bat
pip install -r requirements.txt

echo restart>"%ST%"
echo == Stopping old server on port 8000 ==
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo == Starting Dispatch on http://0.0.0.0:8000 ==
echo (Keep this window open. Close it to stop Dispatch.)
uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
