@echo off
TITLE DOMINION BOT - ARRANQUE
color 0A
cls
echo ===================================================
echo    INICIANDO PROTOCOLO DOMINION (Windows 11)
echo ===================================================
echo.
echo [1/4] Accediendo al directorio...
cd /d "%~dp0"

echo [2/4] Verificando e instalando librerias faltantes...
call npm install

echo [3/4] Compilando codigo TypeScript...
call npm run build:server
IF %ERRORLEVEL% NEQ 0 (
   echo ❌ ERROR DE COMPILACION. NO SE PUEDE INICIAR.
   echo Revisa los errores arriba.
   pause
   exit /b
)

echo [4/4] Iniciando servidor en segundo plano con PM2...
call pm2 delete dominion-server 2>nul
call pm2 start dist/server.js --name "dominion-server"
call pm2 save

echo.
echo ✅ SERVIDOR ACTIVO EN SEGUNDO PLANO
echo -----------------------------------
echo El bot seguira funcionando aunque cierres esta ventana.
echo Usa VER_LOGS.bat para ver que esta pasando.
echo.
timeout /t 10