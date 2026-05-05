@echo off
REM audit-secrets.bat - Auditoria de keys vazadas (Windows)
REM Roda ANTES de qualquer git push public!

cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo [ERRO] PowerShell nao encontrado.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0audit-secrets.ps1"
set EXITCODE=%errorlevel%

echo.
pause
exit /b %EXITCODE%
