# audit-secrets.ps1 - Verifica keys vazadas antes do git push
# Roda ANTES de pushar pra GitHub publico!

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$exitCode = 0

Write-Host ""
Write-Host "  Auditando secrets antes do push..." -ForegroundColor Cyan
Write-Host "  Pasta: $ScriptDir" -ForegroundColor Gray
Write-Host ""

# Patterns de keys reais (não fakes em docs)
$patterns = @(
    'sk-proj-[A-Za-z0-9_\-]{40,}',
    'sk-ant-[A-Za-z0-9_\-]{40,}',
    'gsk_[A-Za-z0-9]{40,}',
    'AIza[A-Za-z0-9_\-]{30,}',
    'sk-or-[A-Za-z0-9_\-]{40,}'
)

# 1. .gitignore protege .env e config.json?
Write-Host "[1/4] Checando .gitignore..." -ForegroundColor Yellow
$gitignoreOk = $true
if (Test-Path ".gitignore") {
    $gitignore = Get-Content ".gitignore" -Raw
    if ($gitignore -notmatch '^\.env\b' -and $gitignore -notmatch '^\.env$') {
        Write-Host "  X .env NAO esta no .gitignore" -ForegroundColor Red
        $exitCode = 1
        $gitignoreOk = $false
    } else {
        Write-Host "  OK .env protegido" -ForegroundColor Green
    }
    if ($gitignore -notmatch '\.env\.local') {
        Write-Host "  X .env.local NAO esta no .gitignore" -ForegroundColor Red
        $exitCode = 1
        $gitignoreOk = $false
    } else {
        Write-Host "  OK .env.local protegido" -ForegroundColor Green
    }
    if ($gitignore -notmatch 'config\.json') {
        Write-Host "  X config.json NAO esta no .gitignore" -ForegroundColor Red
        $exitCode = 1
        $gitignoreOk = $false
    } else {
        Write-Host "  OK config.json protegido" -ForegroundColor Green
    }
} else {
    Write-Host "  X .gitignore nao existe!" -ForegroundColor Red
    $exitCode = 1
}

# 2. Procura keys em arquivos versionados
Write-Host ""
Write-Host "[2/4] Procurando keys em arquivos do codigo..." -ForegroundColor Yellow
$leaked = @()
$extensions = @('*.js', '*.json', '*.md', '*.bat', '*.ps1', '*.sh', '*.html', '*.css')

foreach ($ext in $extensions) {
    $files = Get-ChildItem -Path $ScriptDir -Filter $ext -Recurse -File -ErrorAction SilentlyContinue |
             Where-Object {
                 $_.FullName -notlike "*node_modules*" -and
                 $_.FullName -notlike "*\.git\*" -and
                 $_.FullName -notlike "*\data\*" -and
                 $_.Name -ne 'audit-secrets.ps1' -and
                 $_.Name -ne 'audit-secrets.sh'
             }

    foreach ($f in $files) {
        if ($f.Name -eq '.env' -or $f.Name -eq 'config.json') { continue }
        $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($null -eq $content) { continue }

        foreach ($pat in $patterns) {
            if ($content -match $pat) {
                $leaked += "$($f.FullName.Replace($ScriptDir + '\', ''))"
                break
            }
        }
    }
}

if ($leaked.Count -gt 0) {
    Write-Host "  X KEYS VAZADAS detectadas!" -ForegroundColor Red
    foreach ($f in ($leaked | Select-Object -Unique)) {
        Write-Host "    - $f" -ForegroundColor Red
    }
    $exitCode = 1
} else {
    Write-Host "  OK Nenhuma key encontrada em arquivos do codigo" -ForegroundColor Green
}

# 3. Verifica se .env / config.json estao no indice do git
Write-Host ""
Write-Host "[3/4] Checando indice do git..." -ForegroundColor Yellow
if (Test-Path ".git") {
    try {
        $envInGit = & git ls-files --error-unmatch .env 2>$null
        if ($envInGit) {
            Write-Host "  X .env esta no indice do git! Remove: git rm --cached .env" -ForegroundColor Red
            $exitCode = 1
        }
    } catch {}
    try {
        $cfgInGit = & git ls-files --error-unmatch config.json 2>$null
        if ($cfgInGit) {
            Write-Host "  X config.json esta no indice do git! Remove: git rm --cached config.json" -ForegroundColor Red
            $exitCode = 1
        }
    } catch {}
    if ($exitCode -eq 0) {
        Write-Host "  OK Nenhum arquivo sensivel no indice" -ForegroundColor Green
    }
} else {
    Write-Host "  i Nao eh repo git ainda (rode 'git init' primeiro)" -ForegroundColor Gray
}

# 4. Resumo
Write-Host ""
Write-Host "[4/4] Resumo final..." -ForegroundColor Yellow
Write-Host ""

if ($exitCode -eq 0) {
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   TUDO LIMPO! Pode fazer git push." -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
} else {
    Write-Host "  ============================================" -ForegroundColor Red
    Write-Host "   AUDITORIA FALHOU - NAO FACA PUSH!" -ForegroundColor Red
    Write-Host "   Resolva os erros acima primeiro." -ForegroundColor Red
    Write-Host "  ============================================" -ForegroundColor Red
}

Write-Host ""
exit $exitCode
