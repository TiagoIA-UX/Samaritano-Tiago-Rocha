# Kerneo Lite - Start rapido (assume install.ps1 ja rodou)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

Clear-Host
Write-Host ""
Write-Host "  K E R N E O   L I T E" -ForegroundColor Cyan
Write-Host ""

# Validate state
if (-not (Test-Path "node_modules")) {
    Write-Host "  [ERRO]  Dependencias nao instaladas." -ForegroundColor Red
    Write-Host "  Rode install.bat primeiro." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Pressione Enter pra sair"
    exit 1
}

if (-not (Test-Path ".env")) {
    Write-Host "  [ERRO]  .env nao encontrado." -ForegroundColor Red
    Write-Host "  Rode install.bat primeiro." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Pressione Enter pra sair"
    exit 1
}

# Read PORT from .env (default 5070)
$port = 5070
$envContent = Get-Content ".env" -Raw -Encoding UTF8
if ($envContent -match 'PORT=(\d+)') {
    $port = [int]$Matches[1]
}

# Validate API key looks set
if (-not ($envContent -match 'OPENAI_API_KEY=sk-[A-Za-z0-9_\-]{20,}')) {
    Write-Host "  [AVISO]  OpenAI key parece nao estar configurada." -ForegroundColor Yellow
    Write-Host "  Edite .env ou rode install.bat de novo." -ForegroundColor Yellow
    Write-Host ""
    $resp = Read-Host "Continuar mesmo assim? (S/N)"
    if ($resp -ne 'S' -and $resp -ne 's') { exit 1 }
}

$url = "http://localhost:$port"

Write-Host "  Iniciando servidor em $url" -ForegroundColor White
Write-Host "  Pra parar: feche essa janela ou aperte Ctrl+C" -ForegroundColor Gray
Write-Host ""

Start-Sleep -Seconds 1

try { Start-Process $url } catch {}

Write-Host "============================================================" -ForegroundColor DarkGray
& npm start

Write-Host ""
Write-Host "Servidor parado." -ForegroundColor Yellow
exit 0
