@echo off
rem Dispatch update (Windows): pull latest -> build frontend -> sync backend deps
cd /d "%~dp0.."
echo == Pulling latest code ==
git pull origin claude/clever-cray-o05a2o
echo == Building frontend ==
cd frontend
call npm install
call npm run build
echo == Updating backend packages ==
cd ..\backend
call .venv\Scripts\activate.bat
pip install -r requirements.txt
echo.
echo ============================================
echo  Update done! Close the old win-start window,
echo  then run win-start.bat again.
echo ============================================
pause
