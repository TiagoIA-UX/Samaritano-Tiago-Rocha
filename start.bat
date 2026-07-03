@echo off
REM Samaritano - Atalho rapido (apos instalacao via install.bat)

title Samaritano - Tiago Rocha

cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo [ERRO] PowerShell nao encontrado.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set EXITCODE=%errorlevel%

if not "%EXITCODE%"=="0" (
    echo.
    pause
)

exit /b %EXITCODE%
