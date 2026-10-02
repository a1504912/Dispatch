@echo off
rem One-time setup: start Dispatch automatically at login (re-arm Funnel + start server).
rem Usage: right-click this file -> "Run as administrator", once.
rem KEEP THIS FILE ASCII-ONLY (see win-restart.bat for why).

setlocal
set "START=%~dp0win-start.bat"

echo Registering auto-start task "DispatchAutoStart" ...
schtasks /Create /TN "DispatchAutoStart" /TR "cmd /c \"%START%\"" /SC ONLOGON /RL HIGHEST /F
if errorlevel 1 (
  echo.
  echo [FAILED] Could not register the task. Run this file "as administrator".
  pause
  exit /b 1
)

echo.
echo [DONE] win-start.bat will run every time you log in to this PC:
echo   - re-arm Tailscale Funnel (serve reset + funnel --bg 8000)
echo   - start the Dispatch backend (port 8000)
echo.
echo To test now without rebooting, run: deploy\win-start.bat
echo To remove auto-start: schtasks /Delete /TN "DispatchAutoStart" /F
echo.
pause
