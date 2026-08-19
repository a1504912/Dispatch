@echo off
rem Dispatch 啟動（Windows）：後端同時供應前端網頁，聽 0.0.0.0:8000
cd /d "%~dp0..\backend"
call .venv\Scripts\activate.bat
uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
