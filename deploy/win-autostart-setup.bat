@echo off
rem 一次性設定：讓 Dispatch 在「登入時」自動啟動（重掛 Funnel + 起伺服器）。
rem 用法：對這個檔案按右鍵 →「以系統管理員身分執行」，跑一次就好。
rem 之後每次登入這台主機，Dispatch 和 Funnel 都會自動拉起來。

setlocal
set "START=%~dp0win-start.bat"

echo 正在註冊開機自動啟動工作 "DispatchAutoStart" ...
schtasks /Create /TN "DispatchAutoStart" /TR "cmd /c \"%START%\"" /SC ONLOGON /RL HIGHEST /F
if errorlevel 1 (
  echo.
  echo [失敗] 註冊工作失敗。請確認你是用「系統管理員身分」執行這個檔案。
  pause
  exit /b 1
)

echo.
echo [完成] 已設定：登入這台主機時會自動執行 win-start.bat
echo   - 重掛 Tailscale Funnel（serve reset + funnel --bg 8000）
echo   - 啟動 Dispatch 後端（port 8000）
echo.
echo 想立刻測試不用重開機，可直接執行：deploy\win-start.bat
echo 想取消自動啟動：schtasks /Delete /TN "DispatchAutoStart" /F
echo.
pause
