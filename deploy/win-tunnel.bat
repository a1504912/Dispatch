@echo off
rem Dispatch public tunnel (Cloudflare quick tunnel).
rem This window ONLY runs the tunnel, separate from the Dispatch server.
rem "Update now" restarts only the server (port 8000), not this window,
rem so the tunnel reconnects automatically and the URL does NOT change.
rem Usage: double-click this file and leave the window open.
rem KEEP THIS FILE ASCII-ONLY (see win-restart.bat for why).

title Dispatch tunnel (Cloudflare) - keep this window open
rem Make sure cloudflared is found (both possible install paths)
set "PATH=%PATH%;C:\Program Files (x86)\cloudflared;C:\Program Files\cloudflared"

echo ================================================================
echo   Dispatch public tunnel (Cloudflare)
echo   - Keep this window open
echo   - The URL is printed below: https://xxxxx.trycloudflare.com
echo   - "Update now" does not change the URL
echo   - The URL changes only if you close this window or reboot
echo ================================================================
echo.

:loop
cloudflared tunnel --url http://localhost:8000
echo.
echo [Tunnel stopped] Restarting in 5 seconds (NOTE: a restart gives a NEW URL)...
timeout /t 5 >nul
goto loop
