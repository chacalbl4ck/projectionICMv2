@echo off
title Projecao ICM HTML5 - Servidor Local
echo ========================================================
echo       PROJECAO ICM HTML5 - INICIANDO SISTEMA
echo ========================================================
echo.
echo Iniciando servidor local na porta 8000...
echo Isso garante liberacao total de reproducao de videos do YouTube,
echo streaming OBS e comunicacao sem restricoes de seguranca local.
echo.

:: Tenta iniciar via Python (porta 8000)
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Python detectado. Abrindo navegador...
    start http://localhost:8000/index.html
    python -m http.server 8000
    goto fim
)

:: Tenta iniciar via Node.js
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Node.js detectado. Abrindo navegador...
    start http://localhost:8000/index.html
    npx -y serve -l 8000 .
    goto fim
)

:: Caso nao tenha Python nem Node, abre diretamente o arquivo HTML
echo Abrindo diretamente index.html...
start index.html

:fim
