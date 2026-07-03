@echo off
REM Samaritano - Diagnostico de problemas
title Samaritano - Troubleshoot

cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo [ERRO] PowerShell nao encontrado.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0troubleshoot.ps1"
pause
exit /b 0
