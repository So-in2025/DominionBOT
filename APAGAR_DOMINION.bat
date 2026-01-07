@echo off
TITLE APAGAR DOMINION
color 0C
cls
echo ===================================================
echo    DETENIENDO DOMINION BOT
echo ===================================================
cd /d "%~dp0"

call pm2 stop dominion-server
call pm2 delete dominion-server
call pm2 save

echo.
echo 🛑 SERVIDOR DETENIDO Y ELIMINADO DE MEMORIA
echo.
pause