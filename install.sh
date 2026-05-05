#!/usr/bin/env bash
# install.sh — Instalador Kerneo Lite (Mac/Linux)
# Uso: bash install.sh   (ou: chmod +x install.sh && ./install.sh)

set -e

clear
echo
echo "  ============================================"
echo "           KERNEO LITE - INSTALADOR"
echo "  ============================================"
echo
echo "   Esse script vai:"
echo "    1) Verificar Node.js"
echo "    2) Instalar dependencias (~30s)"
echo "    3) Pedir sua OpenAI API key"
echo "    4) Iniciar servidor + abrir navegador"
echo
echo "   Total: ~2 minutos."
echo
read -p "   Pressione Enter pra comecar..."


# ── 1. NODE.JS ──
echo
echo "[1/4] Verificando Node.js..."
if ! command -v node >/dev/null 2>&1; then
    echo
    echo "  ERRO: Node.js nao encontrado."
    echo
    echo "  Instale primeiro:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "    macOS:  brew install node   (ou baixe em https://nodejs.org)"
    else
        echo "    Linux:  sudo apt install nodejs npm"
        echo "    OU:     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "            sudo apt-get install -y nodejs"
    fi
    echo
    exit 1
fi

NODE_VER=$(node --version)
echo "  OK  Node.js $NODE_VER detectado"


# ── 2. NPM INSTALL ──
echo
echo "[2/4] Instalando dependencias..."
if [ -d "node_modules" ]; then
    echo "  OK  Ja instaladas - pulando"
else
    echo "  Baixando 77 pacotes - aguarde..."
    npm install --silent
    echo "  OK  Instaladas"
fi


# ── 3. .ENV ──
echo
echo "[3/4] Configurando OpenAI API key..."

# Se .env já existe e tem key válida, pula
if [ -f ".env" ] && grep -q "^OPENAI_API_KEY=sk-" .env 2>/dev/null; then
    echo "  OK  .env ja configurado"
else
    [ ! -f ".env" ] && cp .env.example .env

    echo
    echo "  Voce precisa de uma OpenAI API key."
    echo
    echo "  Pegue em: https://platform.openai.com/api-keys"
    echo "  (faca login, clique \"Create new secret key\", copie o valor)"
    echo
    echo "  Conta nova ganha 5 dolares gratis - da pra meses de uso."
    echo
    read -p "  Cole aqui sua key (comeca com sk-): " APIKEY

    if [ -z "$APIKEY" ]; then
        echo "  ERRO: Nenhuma key digitada."
        exit 1
    fi

    # Usa Node pra editar .env (compatível Mac/Linux)
    node -e "const fs=require('fs'); let s=fs.readFileSync('.env','utf-8'); s=s.replace(/OPENAI_API_KEY=.*/,'OPENAI_API_KEY='+process.argv[1]); fs.writeFileSync('.env',s);" "$APIKEY"

    echo "  OK  .env configurado"
fi


# ── 4. START ──
echo
echo "[4/4] Iniciando servidor..."
echo
echo "  ============================================"
echo "   KERNEO LITE PRONTO!"
echo "  ============================================"
echo
echo "   Em 3 segundos:"
echo "    - Abre http://localhost:5070 no navegador"
echo "    - Inicia servidor nesse terminal"
echo
echo "   Pra parar: Ctrl+C"
echo
echo "  ============================================"
echo
sleep 3

# Abre browser (Mac usa 'open', Linux 'xdg-open')
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:5070
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:5070 >/dev/null 2>&1 &
fi

npm start
