# ============================================================
#  Kerneo Lite - Instalador profissional (PowerShell)
#
#  Roda em qualquer Windows 7+ via:
#    powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
#
#  Estrategia:
#    1) Pre-flight: valida ambiente antes de mexer em nada
#    2) Etapas idempotentes: rodar 2x = ok, sem efeito colateral
#    3) Mensagens claras com action items pro usuario leigo
#    4) Log persistente em install.log pra debug
# ============================================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

# Log setup
$LogFile = Join-Path $ScriptDir "install.log"
"=== Install run at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $LogFile -Encoding utf8

function Log-Info($msg) {
    "$(Get-Date -Format 'HH:mm:ss')  INFO  $msg" | Out-File -FilePath $LogFile -Append -Encoding utf8
}
function Log-Error($msg) {
    "$(Get-Date -Format 'HH:mm:ss')  ERROR $msg" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

function Write-Title($text) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Write-Step($num, $total, $text) {
    Write-Host ""
    Write-Host "[$num/$total] $text" -ForegroundColor Yellow
}

function Write-Ok($text) {
    Write-Host "  OK  " -NoNewline -ForegroundColor Green
    Write-Host $text
    Log-Info "OK: $text"
}

function Write-Warn($text) {
    Write-Host "  AVISO  " -NoNewline -ForegroundColor Yellow
    Write-Host $text
    Log-Info "WARN: $text"
}

function Write-Fail($text) {
    Write-Host "  ERRO  " -NoNewline -ForegroundColor Red
    Write-Host $text
    Log-Error $text
}

function Pause-Continue() {
    Write-Host ""
    Write-Host "Pressione Enter pra continuar..." -ForegroundColor Gray
    [void](Read-Host)
}

# ============================================================
#  HEADER
# ============================================================
Clear-Host
Write-Host ""
Write-Host "  K E R N E O   L I T E" -ForegroundColor Cyan
Write-Host "  Instalador automatico v1.0" -ForegroundColor Gray
Write-Host ""
Write-Host "  Esse script vai:" -ForegroundColor White
Write-Host "    1) Verificar o ambiente do seu PC"
Write-Host "    2) Instalar Node.js se necessario"
Write-Host "    3) Baixar as dependencias do Kerneo"
Write-Host "    4) Pedir sua OpenAI API key"
Write-Host "    5) Iniciar o servidor + abrir o navegador"
Write-Host ""
Write-Host "  Tempo estimado: 2-5 minutos" -ForegroundColor Gray
Write-Host ""
Write-Host "  Log detalhado: $LogFile" -ForegroundColor DarkGray
Write-Host ""
Pause-Continue


# ============================================================
#  ETAPA 1 / 5 - PRE-FLIGHT CHECKS
# ============================================================
Write-Step 1 5 "Verificando seu sistema..."

# 1a. Path com caracteres especiais?
if ($ScriptDir -match '[^\x00-\x7F]') {
    Write-Warn "Pasta com acentos detectada: $ScriptDir"
    Write-Host "         Pode causar problemas. Considere mover pra C:\Kerneo" -ForegroundColor Yellow
} else {
    Write-Ok "Pasta sem caracteres especiais"
}

# 1b. Pendrive read-only?
$drive = (Get-Item $ScriptDir).PSDrive
if ($drive.DisplayRoot -or $drive.Description -like '*Removable*' -or $drive.Description -like '*USB*') {
    Write-Warn "Voce esta rodando do pendrive/USB."
    Write-Host "         Recomendo COPIAR a pasta pra C:\Kerneo antes de continuar." -ForegroundColor Yellow
    Write-Host "         Pendrives sao lentos e podem ter problemas de permissao." -ForegroundColor Yellow
    Write-Host ""
    $resp = Read-Host "Continuar mesmo assim? (S/N)"
    if ($resp -ne 'S' -and $resp -ne 's') {
        Write-Host ""
        Write-Host "Cancelado. Copie a pasta pra C:\ e rode install.bat de novo." -ForegroundColor Cyan
        exit 0
    }
} else {
    Write-Ok "Pasta em disco local"
}

# 1c. Espaco em disco (precisa ~300MB pra node_modules)
try {
    $drive = (Get-Item $ScriptDir).PSDrive
    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    if ($freeGB -lt 1) {
        Write-Warn "Pouco espaco em disco: ${freeGB}GB livres. Precisa minimo 500MB."
    } else {
        Write-Ok "Espaco em disco: ${freeGB}GB livres"
    }
} catch {
    Log-Info "Skip disk check: $($_.Exception.Message)"
}

# 1d. Internet
Write-Host "  Testando internet..." -NoNewline
try {
    $null = Test-NetConnection -ComputerName 'registry.npmjs.org' -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction Stop
    Write-Host " OK" -ForegroundColor Green
    Log-Info "Internet OK"
} catch {
    # Fallback: try simple TCP connect
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect('registry.npmjs.org', 443, $null, $null)
        $success = $iar.AsyncWaitHandle.WaitOne(5000, $false)
        if ($success) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            Write-Host " OK" -ForegroundColor Green
            Log-Info "Internet OK (fallback)"
        } else {
            Write-Host " FALHOU" -ForegroundColor Red
            Write-Fail "Sem internet ou firewall bloqueando npm registry."
            Write-Host "         Verifique sua conexao e tente de novo."
            exit 1
        }
    } catch {
        Write-Host " FALHOU" -ForegroundColor Red
        Write-Fail "Sem conexao com a internet."
        exit 1
    }
}


# ============================================================
#  ETAPA 2 / 5 - NODE.JS
# ============================================================
Write-Step 2 5 "Verificando Node.js..."

function Get-NodeVersion {
    try {
        $v = & node --version 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        if ($v -match '^v(\d+)\.(\d+)\.(\d+)$') {
            return @{ Full = $v; Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Patch = [int]$Matches[3] }
        }
    } catch {}
    return $null
}

$nodeInfo = Get-NodeVersion

if ($null -eq $nodeInfo) {
    Write-Warn "Node.js nao encontrado."
    Write-Host ""
    Write-Host "  Voce precisa instalar Node.js. Tenho 2 opcoes:" -ForegroundColor White
    Write-Host ""
    Write-Host "    1) Eu instalo automaticamente (recomendado, ~2 min)" -ForegroundColor Cyan
    Write-Host "    2) Voce instala manualmente (mais controle)" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "Escolha 1 ou 2"

    if ($choice -eq '1') {
        # Try winget (Windows 10 1809+)
        $hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
        if ($hasWinget) {
            Write-Host "  Instalando via winget..." -ForegroundColor Yellow
            try {
                & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
                if ($LASTEXITCODE -ne 0) { throw "winget exit $LASTEXITCODE" }
            } catch {
                Write-Fail "winget falhou: $($_.Exception.Message)"
                Write-Host "         Va pra opcao manual: feche essa janela e instale Node.js de https://nodejs.org" -ForegroundColor Yellow
                Start-Process "https://nodejs.org"
                exit 1
            }
            Write-Ok "Node.js instalado via winget"

            # Refresh PATH na sessao atual
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

            # Re-check
            $nodeInfo = Get-NodeVersion
            if ($null -eq $nodeInfo) {
                Write-Warn "Node.js instalado mas nao detectado. Feche o terminal e abra de novo."
                Write-Host "         Depois rode install.bat de novo." -ForegroundColor Yellow
                exit 1
            }
        } else {
            Write-Warn "winget nao disponivel (Windows < 10 1809)."
            Write-Host "         Vou abrir o site pra voce baixar manualmente." -ForegroundColor Yellow
            Start-Process "https://nodejs.org"
            Write-Host ""
            Write-Host "  Apos instalar Node.js (botao verde LTS):" -ForegroundColor Cyan
            Write-Host "    1) Feche essa janela"
            Write-Host "    2) Rode install.bat de novo"
            exit 0
        }
    } else {
        Write-Host ""
        Write-Host "  Vou abrir o site pra voce baixar." -ForegroundColor Cyan
        Start-Process "https://nodejs.org"
        Write-Host ""
        Write-Host "  Apos instalar Node.js (botao verde LTS):" -ForegroundColor Yellow
        Write-Host "    1) Feche essa janela"
        Write-Host "    2) Rode install.bat de novo"
        exit 0
    }
}

# Versao OK?
if ($nodeInfo.Major -lt 20) {
    Write-Warn "Node.js $($nodeInfo.Full) detectado, mas precisamos versao 20 ou superior."
    Write-Host "         Atualize em https://nodejs.org (botao LTS)" -ForegroundColor Yellow
    Start-Process "https://nodejs.org"
    exit 1
}

Write-Ok "Node.js $($nodeInfo.Full) detectado"

# npm OK?
try {
    $npmVer = & npm --version 2>$null
    if ($LASTEXITCODE -ne 0) { throw "npm exit $LASTEXITCODE" }
    Write-Ok "npm $npmVer detectado"
} catch {
    Write-Fail "npm nao funciona. Reinstale o Node.js."
    exit 1
}


# ============================================================
#  ETAPA 3 / 5 - DEPENDENCIAS
# ============================================================
Write-Step 3 5 "Instalando dependencias do Kerneo..."

if (-not (Test-Path "package.json")) {
    Write-Fail "package.json nao encontrado. Voce esta na pasta certa?"
    Write-Host "         Pasta atual: $ScriptDir" -ForegroundColor Yellow
    exit 1
}

# Detect node_modules state
$needInstall = $true
if (Test-Path "node_modules") {
    # Has package-lock match? Quick sanity check
    if ((Test-Path "node_modules\better-sqlite3") -and (Test-Path "node_modules\openai")) {
        Write-Ok "Dependencias ja instaladas"
        $needInstall = $false
    } else {
        Write-Warn "node_modules incompleto detectado. Vou reinstalar."
        try { Remove-Item "node_modules" -Recurse -Force -ErrorAction Stop } catch {
            Write-Warn "Nao consegui remover node_modules (talvez antivirus). Tentando install em cima."
        }
    }
}

if ($needInstall) {
    Write-Host "  Baixando 77 pacotes (~30-60s)..." -ForegroundColor Gray

    $attempt = 0
    $maxAttempts = 3
    $installed = $false

    while ($attempt -lt $maxAttempts -and -not $installed) {
        $attempt++
        Log-Info "npm install attempt $attempt"
        try {
            $output = & npm install --silent --no-audit --no-fund 2>&1 | Out-String
            $output | Out-File -FilePath $LogFile -Append -Encoding utf8
            if ($LASTEXITCODE -eq 0) {
                $installed = $true
                Write-Ok "Dependencias instaladas"
            } else {
                if ($attempt -lt $maxAttempts) {
                    Write-Warn "Tentativa $attempt falhou. Tentando de novo..."
                    Start-Sleep -Seconds 2
                    # Cache clean entre tentativas
                    if ($attempt -eq 2) {
                        & npm cache clean --force 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
                    }
                } else {
                    Write-Fail "npm install falhou apos $maxAttempts tentativas."
                    Write-Host ""
                    Write-Host "  Possiveis causas:" -ForegroundColor Yellow
                    Write-Host "    - Antivirus bloqueando (desabilite temporariamente)"
                    Write-Host "    - Internet instavel (tente em outra rede)"
                    Write-Host "    - Proxy corporativo (pode precisar configurar)"
                    Write-Host ""
                    Write-Host "  Log completo em: $LogFile" -ForegroundColor Gray
                    exit 1
                }
            }
        } catch {
            Write-Fail "Erro ao rodar npm: $($_.Exception.Message)"
            exit 1
        }
    }
}


# ============================================================
#  ETAPA 4 / 5 - OPENAI API KEY
# ============================================================
Write-Step 4 5 "Configurando OpenAI API key..."

# Verifica se ja tem .env valido
$envValid = $false
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw -Encoding UTF8
    if ($envContent -match 'OPENAI_API_KEY=sk-[A-Za-z0-9_\-]{20,}') {
        Write-Ok ".env ja configurado com uma key valida"
        $envValid = $true
    }
}

if (-not $envValid) {
    # Cria .env do template se nao existe
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
        } else {
            "OPENAI_API_KEY=" | Out-File -FilePath ".env" -Encoding utf8 -NoNewline
        }
    }

    # Cria config.json se nao existe (vamos usar pra setar provider escolhido)
    if (-not (Test-Path "config.json") -and (Test-Path "config.json.example")) {
        Copy-Item "config.json.example" "config.json"
    }
    $cfgPath = Join-Path $ScriptDir "config.json"
    $envPath = Join-Path $ScriptDir ".env"

    Write-Host ""
    Write-Host "  ----------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "   ESCOLHA SEU PROVIDER LLM                           " -ForegroundColor Cyan
    Write-Host "  ----------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Opcao 1: GROQ (recomendado pra comecar)" -ForegroundColor Green
    Write-Host "    + Free tier generoso (sem cartao de credito)" -ForegroundColor Gray
    Write-Host "    + GPT-OSS 120B - rapido e bom em PT-BR" -ForegroundColor Gray
    Write-Host "    - Sem voz/TTS (precisa OpenAI tambem se quiser falar)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Opcao 2: OPENAI (full features)" -ForegroundColor Cyan
    Write-Host "    + Cobre LLM + voz (TTS/STT) + visao com 1 chave" -ForegroundColor Gray
    Write-Host "    - Precisa cartao de credito (~`$5 inicial)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Opcao 3: PULAR (configurar manualmente em config.json)" -ForegroundColor Yellow
    Write-Host "    Voce pode escolher Anthropic, Gemini, Ollama local, etc." -ForegroundColor Gray
    Write-Host "    Caminho do arquivo:" -ForegroundColor Gray
    Write-Host "      $cfgPath" -ForegroundColor Yellow
    Write-Host ""

    $providerChoice = Read-Host "  Sua escolha (1=Groq, 2=OpenAI, 3=Pular)"

    $apiKey = $null
    $providerName = $null
    $keyPattern = $null
    $keyLabel = $null
    $keyUrl = $null

    if ($providerChoice -eq '1') {
        $providerName = 'groq'
        $keyPattern = '^gsk_[A-Za-z0-9]{40,}$'
        $keyLabel = 'Groq API key (comeca com gsk_)'
        $keyUrl = 'https://console.groq.com/keys'
    } elseif ($providerChoice -eq '2' -or [string]::IsNullOrWhiteSpace($providerChoice)) {
        $providerName = 'openai'
        $keyPattern = '^sk-[A-Za-z0-9_\-]{20,}$'
        $keyLabel = 'OpenAI API key (comeca com sk-)'
        $keyUrl = 'https://platform.openai.com/api-keys'
    } else {
        # Pular
        Write-Host ""
        Write-Host "  Tudo bem, configuracao manual." -ForegroundColor Yellow
        Write-Host "  Edite o arquivo $cfgPath" -ForegroundColor Yellow
        Write-Host "  Depois rode start.bat" -ForegroundColor Yellow
        $apiKey = $null
    }

    if ($providerName) {
        Write-Host ""
        Write-Host "  Como pegar tua $keyLabel" -ForegroundColor Cyan
        Write-Host "    1) Vou abrir o site agora"
        Write-Host "    2) Faca login (ou crie conta - leva 2 min)"
        if ($providerName -eq 'groq') {
            Write-Host "    3) Clique 'Create API Key'"
            Write-Host "    4) De um nome (ex: 'Kerneo') e cria"
        } else {
            Write-Host "    3) Clique 'Create new secret key'"
            Write-Host "    4) De um nome (ex: 'Kerneo') e clique 'Create'"
        }
        Write-Host "    5) COPIE a key"
        Write-Host "    6) Volte aqui e cole abaixo"
        Write-Host ""

        Start-Sleep -Seconds 2
        Start-Process $keyUrl

        Write-Host ""
        do {
            $apiKey = Read-Host "  Cole tua $keyLabel aqui (ou Enter pra pular)"
            $apiKey = $apiKey.Trim().Trim('"').Trim("'")
            if ([string]::IsNullOrWhiteSpace($apiKey)) {
                Write-Warn "Pulando."
                $apiKey = $null
                break
            }
            if (-not ($apiKey -match $keyPattern)) {
                Write-Warn "Formato invalido. Esperado: $keyLabel"
                Write-Host "         Voce colou: '$($apiKey.Substring(0, [math]::Min(20, $apiKey.Length)))...'" -ForegroundColor Gray
                $resp = Read-Host "  Tentar de novo? (S/N)"
                if ($resp -ne 'S' -and $resp -ne 's') { $apiKey = $null; break }
                continue
            }
            break
        } while ($true)
    }

    if ($apiKey -and $providerName) {
        # Salva no config.json (preferido) E .env (fallback)
        try {
            $cfgRaw = Get-Content $cfgPath -Raw -Encoding UTF8
            $cfg = $cfgRaw | ConvertFrom-Json
            $cfg.providers.$providerName.apiKey = $apiKey
            $cfg | ConvertTo-Json -Depth 10 | Out-File -FilePath $cfgPath -Encoding utf8
            Write-Ok "config.json: providers.$providerName.apiKey setado"
        } catch {
            Write-Warn "Falha ao editar config.json: $_"
        }

        # .env legacy (caso config.json falhe)
        $envVarName = "$($providerName.ToUpper())_API_KEY"
        $envContent = Get-Content $envPath -Raw -Encoding UTF8
        if ($envContent -match "$envVarName=") {
            $envContent = $envContent -replace "$envVarName=.*", "$envVarName=$apiKey"
        } else {
            $envContent = "$envVarName=$apiKey`n" + $envContent
        }
        [System.IO.File]::WriteAllText($envPath, $envContent, [System.Text.UTF8Encoding]::new($false))

        Write-Ok "Provider $providerName configurado"
    } else {
        Write-Host ""
        Write-Host "  IMPORTANTE: configure pelo menos 1 provider antes de usar:" -ForegroundColor Yellow
        Write-Host "    $cfgPath" -ForegroundColor Yellow
        Write-Host ""
    }
}


# ============================================================
#  ETAPA 5 / 5 - INICIAR SERVIDOR
# ============================================================
Write-Step 5 5 "Preparando para iniciar..."

# Detect porta livre (5070 default, ate 5099)
$port = 5070
$portsToTry = 5070..5099
$freePort = $null

foreach ($p in $portsToTry) {
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect('127.0.0.1', $p, $null, $null)
        $success = $iar.AsyncWaitHandle.WaitOne(200, $false)
        if (-not $success) {
            # Timeout = port livre
            $freePort = $p
            $tcp.Close()
            break
        } else {
            $tcp.EndConnect($iar)
            $tcp.Close()
            # Conectou = port ocupado
        }
    } catch {
        # Erro = port livre
        $freePort = $p
        break
    } finally {
        if ($tcp) { try { $tcp.Close() } catch {} }
    }
}

if ($null -eq $freePort) {
    Write-Fail "Nenhuma porta livre entre 5070-5099. Feche programas em background."
    exit 1
}

if ($freePort -ne 5070) {
    Write-Warn "Porta 5070 ocupada, usando $freePort"
    # Atualiza .env
    $envContent = Get-Content ".env" -Raw -Encoding UTF8
    if ($envContent -match 'PORT=') {
        $envContent = $envContent -replace 'PORT=\d+', "PORT=$freePort"
    } else {
        $envContent = "PORT=$freePort`n" + $envContent
    }
    [System.IO.File]::WriteAllText((Join-Path $ScriptDir ".env"), $envContent, [System.Text.UTF8Encoding]::new($false))
} else {
    Write-Ok "Porta 5070 disponivel"
}

$url = "http://localhost:$freePort"

Write-Host ""
Write-Title "TUDO PRONTO! Iniciando Kerneo Lite..."
Write-Host ""
Write-Host "  Acesse: " -NoNewline
Write-Host $url -ForegroundColor Cyan
Write-Host ""
Write-Host "  Em 3 segundos vou abrir o navegador automaticamente." -ForegroundColor Gray
Write-Host "  Pra parar o servidor: feche essa janela ou aperte Ctrl+C" -ForegroundColor Gray
Write-Host ""
Write-Host "  Comandos pra testar:" -ForegroundColor Yellow
Write-Host "    - oi"
Write-Host "    - que horas sao"
Write-Host "    - abre o youtube"
Write-Host "    - pesquisa pizza no google"
Write-Host ""

Start-Sleep -Seconds 3

# Abre browser
try {
    Start-Process $url -ErrorAction Stop
    Log-Info "Browser opened at $url"
} catch {
    Write-Warn "Nao consegui abrir browser auto. Acesse: $url"
}

# Inicia o server (bloqueia ate Ctrl+C)
Log-Info "Starting server on port $freePort"
Write-Host "============================================================" -ForegroundColor DarkGray
& npm start

# Se chegar aqui, server foi parado
Write-Host ""
Write-Host "Servidor parado." -ForegroundColor Yellow
exit 0
