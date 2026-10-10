@echo off
rem Turn on Tailscale Funnel: exposes local :8000 as a PUBLIC https URL.
rem Other devices then need NO Tailscale -- just open the ts.net URL.
set TS="C:\Program Files\Tailscale\tailscale.exe"

echo == Enabling Funnel on port 8000 (runs in background) ==
%TS% funnel --bg 8000

echo.
echo == Current Funnel status ==
%TS% funnel status

echo.
echo Now open this URL from ANY device (phone on mobile data, work PC...):
echo    https://torz-host.tail062e1b.ts.net
echo.
echo (You only need to run this once. It stays on and resumes after reboot,
echo  as long as Tailscale and Dispatch are running.)
pause
