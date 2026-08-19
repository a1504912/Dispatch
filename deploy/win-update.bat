@echo off
rem Dispatch 更新（Windows）：拉新程式 -> 建前端 -> 補後端套件
cd /d "%~dp0.."
echo == 拉取最新程式 ==
git pull origin claude/clever-cray-o05a2o
echo == 建置前端 ==
cd frontend
call npm install
call npm run build
echo == 更新後端套件 ==
cd ..\backend
call .venv\Scripts\activate.bat
pip install -r requirements.txt
echo.
echo ============================================
echo  更新完成！請關掉舊的 win-start 視窗，
echo  再重新執行 win-start.bat 即可。
echo ============================================
pause
