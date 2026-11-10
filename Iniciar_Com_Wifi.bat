@echo off
title Projecao ICM - Servidor Wi-Fi
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ==========================================================
    echo  ERRO: Node.js nao encontrado neste computador.
    echo  Instale o Node.js LTS em https://nodejs.org e tente novamente.
    echo ==========================================================
    pause
    exit /b 1
)

echo Iniciando servidor local para controle via Wi-Fi...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000/index.html"
node server.js
pause
