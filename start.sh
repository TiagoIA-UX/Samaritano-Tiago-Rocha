#!/usr/bin/env bash
# start.sh — Atalho rapido pra rodar Samaritano (Mac/Linux)

if [ ! -d "node_modules" ]; then
    echo "  Dependencias nao instaladas. Rode install.sh primeiro."
    exit 1
fi
if [ ! -f ".env" ]; then
    echo "  .env nao encontrado. Rode install.sh primeiro."
    exit 1
fi

echo "  Iniciando Samaritano..."
echo "  Pra parar: Ctrl+C"
echo

sleep 1

if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:5070
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:5070 >/dev/null 2>&1 &
fi

npm start
