#!/usr/bin/env bash
# audit-secrets.sh — Verifica se há keys vazadas antes de fazer push.
# RODA ISSO ANTES DE QUALQUER git push public!
#
# Uso:
#   bash audit-secrets.sh
#
# Se passar (exit 0), pode pushar. Se falhar (exit 1), apaga as keys ANTES.

set -e

cd "$(dirname "$0")"

echo "🔍 Auditando secrets em arquivos rastreados pelo git..."
echo ""

EXIT=0

# 1. Verifica se .env está no gitignore
if ! grep -q '^\.env$' .gitignore 2>/dev/null && ! grep -q '^\.env\b' .gitignore 2>/dev/null; then
    echo "❌ .env NÃO está no .gitignore — risco de vazar key!"
    EXIT=1
else
    echo "✓ .env está no .gitignore"
fi

# 2. Verifica se config.json está no gitignore
if ! grep -q 'config\.json' .gitignore 2>/dev/null; then
    echo "❌ config.json NÃO está no .gitignore — pode vazar keys!"
    EXIT=1
else
    echo "✓ config.json está no .gitignore"
fi

# 3. Procura padrões de API keys em arquivos VERSIONADOS (não em node_modules/.git)
echo ""
echo "Procurando padrões de keys em arquivos do código..."

PATTERNS='sk-proj-[A-Za-z0-9_\-]{40,}|sk-ant-[A-Za-z0-9_\-]{40,}|gsk_[A-Za-z0-9]{40,}|AIza[A-Za-z0-9_\-]{30,}|sk-or-[A-Za-z0-9_\-]{40,}|sk-[A-Za-z0-9]{20,}'

if find . -type f \( -name '*.js' -o -name '*.json' -o -name '*.md' -o -name '*.bat' -o -name '*.ps1' -o -name '*.sh' \) \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './data/*' \
    -not -name 'audit-secrets.sh' \
    -not -name '.env' \
    -not -name 'config.json' \
    -exec grep -lE "$PATTERNS" {} \; 2>/dev/null | head -20; then

    LEAKED=$(find . -type f \( -name '*.js' -o -name '*.json' -o -name '*.md' -o -name '*.bat' -o -name '*.ps1' -o -name '*.sh' \) \
        -not -path './node_modules/*' \
        -not -path './.git/*' \
        -not -path './data/*' \
        -not -name 'audit-secrets.sh' \
        -not -name '.env' \
        -not -name 'config.json' \
        -exec grep -lE "$PATTERNS" {} \; 2>/dev/null)

    if [ -n "$LEAKED" ]; then
        echo ""
        echo "❌ KEYS VAZADAS detectadas nos arquivos acima!"
        echo "   Apague antes de pushar."
        EXIT=1
    else
        echo "✓ Nenhuma key vazada em arquivos versionados"
    fi
fi

# 4. Verifica se git tem .env / config.json no índice (já adicionados)
echo ""
if [ -d .git ]; then
    if git ls-files --error-unmatch .env 2>/dev/null; then
        echo "❌ .env JÁ ESTÁ no índice do git! Remove com: git rm --cached .env"
        EXIT=1
    fi
    if git ls-files --error-unmatch config.json 2>/dev/null; then
        echo "❌ config.json JÁ ESTÁ no índice do git! Remove com: git rm --cached config.json"
        EXIT=1
    fi
else
    echo "ℹ Não é repo git ainda"
fi

# 5. Verifica permissões de arquivo
echo ""
if [ -f .env ]; then
    if [ "$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env 2>/dev/null)" = "644" ]; then
        echo "ℹ .env com permissão 644 — considere chmod 600 .env"
    fi
fi

echo ""
if [ "$EXIT" -eq 0 ]; then
    echo "════════════════════════════════════════════"
    echo "✅ Tudo limpo. Pode fazer git push tranquilo."
    echo "════════════════════════════════════════════"
else
    echo "════════════════════════════════════════════"
    echo "❌ AUDITORIA FALHOU. NÃO FAÇA PUSH!"
    echo "   Resolva os erros acima primeiro."
    echo "════════════════════════════════════════════"
fi

exit $EXIT
