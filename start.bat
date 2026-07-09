@echo off
rem Dispatch 一鍵啟動：後端 + 前端各開一個視窗，最後開啟瀏覽器
start "Dispatch Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "Dispatch Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 5 >nul
start http://localhost:5173
