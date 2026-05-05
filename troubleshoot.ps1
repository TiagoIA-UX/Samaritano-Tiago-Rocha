# Kerneo Lite - Diagnostico
# Coleta info do sistema pra ajudar a identificar problemas.

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $ScriptDir

$ReportFile = Join-Path $ScriptDir "diagnostico.txt"

function Section($title) {
    $bar = "=" * 60
    "" | Tee-Object -Append -FilePath $ReportFile
    "$bar" | Tee-Object -Append -FilePath $ReportFile
    "  $title" | Tee-Object -Append -FilePath $ReportFile
    "$bar" | Tee-Object -Append -FilePath $ReportFile
}

function Item($label, $value) {
    "  $label : $value" | Tee-Object -Append -FilePath $ReportFile
}

# Reset report
"Kerneo Lite - Diagnostico" | Out-File -FilePath $ReportFile -Encoding utf8
"Gerado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -Append -FilePath $ReportFile -Encoding utf8

Clear-Host
Write-Host ""
Write-Host "  Kerneo Lite - Diagnostico" -ForegroundColor Cyan
Write-Host "  Coletando informacoes..." -ForegroundColor Gray
Write-Host ""

# ── Sistema ──
Section "SISTEMA"
Item "OS" ((Get-CimInstance Win32_OperatingSystem).Caption)
Item "Versao Windows" ((Get-CimInstance Win32_OperatingSystem).Version)
Item "Arquitetura" $env:PROCESSOR_ARCHITECTURE
Item "Idioma" (Get-WinSystemLocale).Name
Item "Code Page atual" (cmd /c chcp)
Item "PowerShell" $PSVersionTable.PSVersion.ToString()
Item "Pasta atual" $ScriptDir

# ── Path/encoding issues ──
Section "AMBIENTE"
$hasNonAscii = $ScriptDir -match '[^\x00-\x7F]'
Item "Path tem acentos?" ($hasNonAscii -as [string])
$drive = (Get-Item $ScriptDir).PSDrive
Item "Drive type" ($drive.Description)
Item "Drive name" ($drive.Name)
Item "Free space (GB)" ([math]::Round($drive.Free / 1GB, 1))

# ── Node.js ──
Section "NODE.JS"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Item "Node.js path" $node.Source
    Item "Node version" (& node --version)
    Item "npm version" (& npm --version)
} else {
    Item "Node.js" "NAO INSTALADO"
}

# ── Kerneo files ──
Section "ARQUIVOS DO KERNEO"
$expected = @('package.json', '.env.example', 'src\server.js', 'public\index.html', 'install.bat', 'install.ps1')
foreach ($f in $expected) {
    $exists = Test-Path $f
    Item $f ($(if ($exists) { "OK" } else { "FALTANDO" }))
}

Item ".env existe?" (Test-Path ".env")
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    Item ".env tem OPENAI_API_KEY?" ([bool]($envContent -match 'OPENAI_API_KEY=sk-'))
    Item ".env tem PORT customizada?" ([bool]($envContent -match 'PORT=\d+'))
}

Item "node_modules existe?" (Test-Path "node_modules")
if (Test-Path "node_modules") {
    Item "node_modules count" (Get-ChildItem "node_modules" -Directory).Count
    Item "openai instalado?" (Test-Path "node_modules\openai")
    Item "better-sqlite3 instalado?" (Test-Path "node_modules\better-sqlite3")
}

# ── Network ──
Section "REDE"
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect('registry.npmjs.org', 443, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(3000, $false)
    if ($ok) { $tcp.EndConnect($iar); $tcp.Close() }
    Item "registry.npmjs.org:443" ($(if ($ok) { "ALCANCAVEL" } else { "TIMEOUT" }))
} catch {
    Item "registry.npmjs.org:443" "FALHOU: $($_.Exception.Message)"
}

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect('api.openai.com', 443, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(3000, $false)
    if ($ok) { $tcp.EndConnect($iar); $tcp.Close() }
    Item "api.openai.com:443" ($(if ($ok) { "ALCANCAVEL" } else { "TIMEOUT" }))
} catch {
    Item "api.openai.com:443" "FALHOU: $($_.Exception.Message)"
}

# ── Portas ──
Section "PORTAS"
foreach ($p in 5070, 5071, 5072, 5073, 5074, 5075) {
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect('127.0.0.1', $p, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(200, $false)
        if ($ok) { $tcp.EndConnect($iar); $tcp.Close(); Item "Porta $p" "OCUPADA" }
        else { Item "Porta $p" "LIVRE" }
    } catch {
        Item "Porta $p" "LIVRE"
    } finally {
        if ($tcp) { try { $tcp.Close() } catch {} }
    }
}

# ── PowerShell policy ──
Section "POWERSHELL"
Item "ExecutionPolicy (LocalMachine)" (Get-ExecutionPolicy -Scope LocalMachine)
Item "ExecutionPolicy (CurrentUser)" (Get-ExecutionPolicy -Scope CurrentUser)
Item "ExecutionPolicy (Process)" (Get-ExecutionPolicy -Scope Process)

# ── Logs anteriores ──
Section "LOGS"
if (Test-Path "install.log") {
    Item "install.log" "EXISTE"
    "" | Tee-Object -Append -FilePath $ReportFile
    "Ultimas 30 linhas do install.log:" | Tee-Object -Append -FilePath $ReportFile
    Get-Content "install.log" -Tail 30 | Out-File -Append -FilePath $ReportFile -Encoding utf8
} else {
    Item "install.log" "NAO EXISTE (instalador nunca rodou)"
}

# ── Final ──
Write-Host ""
Write-Host "  Diagnostico salvo em: $ReportFile" -ForegroundColor Green
Write-Host ""
Write-Host "  Pra suporte: copie o conteudo do arquivo e mande pro time." -ForegroundColor Yellow
Write-Host ""
