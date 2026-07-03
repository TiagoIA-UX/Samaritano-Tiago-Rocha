@echo off
REM ============================================================
REM  Samaritano - Wrapper minimal (ASCII puro, sem dependencias)
REM  Funciona em qualquer Windows 7+ em qualquer code page.
REM  Toda a logica esta no install.ps1.
REM ============================================================

title Samaritano - Instalador

REM Move pra pasta do script (suporta paths com espacos e acentos)
cd /d "%~dp0"

REM Verifica se PowerShell esta disponivel (vem com Windows 7+)
where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERRO] PowerShell nao foi encontrado neste sistema.
    echo PowerShell vem instalado por padrao no Windows 7 e superior.
    echo Verifique se o sistema esta corrompido.
    echo.
    pause
    exit /b 1
)

REM Roda o instalador real via PowerShell, BYPASSANDO ExecutionPolicy.
REM Isso funciona mesmo em PCs corporativos com policy restritiva.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set EXITCODE=%errorlevel%

REM Se algo falhou, pausa pra usuario ler antes da janela fechar
if not "%EXITCODE%"=="0" (
    echo.
    echo Pressione qualquer tecla para sair.
    pause >nul
)

exit /b %EXITCODE%
