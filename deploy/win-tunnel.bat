@echo off
rem === Dispatch 對外通道（Cloudflare 臨時通道）===
rem 這個視窗「只跑通道」，跟 Dispatch 伺服器分開。
rem 「立即更新」只會重啟伺服器（8000 埠），不會關到這個視窗；
rem 伺服器重啟後，通道會自動接回，網址「不會變」。
rem 用法：把這個檔案獨立跑起來（雙擊即可），然後視窗放著別關。

title Dispatch 對外通道 (Cloudflare) - 保持開著別關
rem 確保找得到 cloudflared（兩種可能的安裝路徑都加進 PATH）
set "PATH=%PATH%;C:\Program Files (x86)\cloudflared;C:\Program Files\cloudflared"

echo ================================================================
echo   Dispatch 對外通道 (Cloudflare)
echo   - 這個視窗保持開著別關
echo   - 下面會印出網址：https://xxxxx.trycloudflare.com
echo   - 伺服器「立即更新」時，通道會自動接回，網址不變
echo   - 只有「關掉這個視窗」或「主機重開機」網址才會換
echo ================================================================
echo.

:loop
cloudflared tunnel --url http://localhost:8000
echo.
echo [通道中斷] 5 秒後自動重開（注意：重開會換一組新網址）...
timeout /t 5 >nul
goto loop
