@echo off
rem Dispatch start (Windows): backend also serves the built frontend on 0.0.0.0:8000
cd /d "%~dp0..\backend"
call .venv\Scripts\activate.bat
uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
