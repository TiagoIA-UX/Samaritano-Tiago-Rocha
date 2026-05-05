# API Reference — Kerneo Lite

## `GET /health`

Status do servidor.

```bash
curl http://localhost:5070/health
```

**Resposta**:
```json
{
  "ready": true,
  "ts": 1734567890123,
  "tools": 6,
  "version": "0.1.0"
}
```

---

## `GET /tools`

Lista tools registradas (com schema completo).

```bash
curl http://localhost:5070/tools
```

**Resposta**:
```json
{
  "tools": [
    {
      "name": "browser_open",
      "description": "Abre URL no navegador padrão...",
      "parameters": { "type": "object", "properties": {...}, "required": ["url"] }
    },
    ...
  ]
}
```

---

## `POST /chat`

Endpoint principal. Manda input do user, recebe resposta + tool calls executadas.

```bash
curl -X POST http://localhost:5070/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "session": "my-session",
    "message": "abre o youtube"
  }'
```

**Resposta**:
```json
{
  "ok": true,
  "text": "Abri https://www.youtube.com no seu navegador.",
  "tool_calls": [
    {
      "name": "browser_open",
      "args": { "url": "youtube" },
      "output": {
        "ok": true,
        "url": "https://www.youtube.com",
        "message": "Abri https://www.youtube.com no seu navegador."
      }
    }
  ],
  "from_reflex": false,
  "iterations": 2,
  "duration_ms": 1234
}
```

**Campos**:
- `session` (string, opcional): id de sessão pra histórico. Default: `"default"`.
- `message` (string, obrigatório): input do user.

---

## `POST /tts`

Gera áudio MP3 a partir de texto via OpenAI TTS streaming.

```bash
curl -X POST http://localhost:5070/tts \
  -H 'Content-Type: application/json' \
  -d '{ "text": "Olá, mundo!" }' \
  --output speech.mp3
```

**Body**:
```json
{
  "text": "Texto pra falar (max ~4000 chars)",
  "voice": "nova",          // opcional: alloy|echo|fable|onyx|nova|shimmer|sage|coral|verse
  "speed": 1.0              // opcional: 0.25 a 4.0
}
```

**Resposta**: stream de áudio MP3 (`Content-Type: audio/mpeg`).

---

## `POST /tools/exec` (debug)

Executa uma tool direto, sem passar pelo orquestrador. Útil pra testar tools isoladamente.

⚠️ **Loopback only** — só aceita calls de 127.0.0.1.

```bash
curl -X POST http://localhost:5070/tools/exec \
  -H 'Content-Type: application/json' \
  -d '{
    "tool": "system_info",
    "args": { "type": "datetime" }
  }'
```

**Resposta**:
```json
{
  "ok": true,
  "output": {
    "ok": true,
    "datetime": {
      "iso": "2026-05-02T17:30:00.000Z",
      "date": "02/05/2026",
      "time": "14:30:00",
      "day_of_week": "sábado",
      "timezone": "America/Sao_Paulo"
    },
    "summary": "📅 sábado, 02/05/2026 · 🕐 14:30:00"
  }
}
```

---

## Exemplos de queries via /chat

```bash
# Reflex (zero LLM, ~10ms)
curl -X POST http://localhost:5070/chat -d '{"message": "oi"}' -H 'Content-Type: application/json'
# → "👋 Oi! No que posso ajudar?"

# Tool simples
curl -X POST http://localhost:5070/chat -d '{"message": "abre o google"}' -H 'Content-Type: application/json'
# → tool_calls: [{ name: "browser_open", ... }]

# Web search
curl -X POST http://localhost:5070/chat -d '{"message": "preço de bitcoin hoje"}' -H 'Content-Type: application/json'
# → tool_calls: [{ name: "web_search", ... }]

# Memory
curl -X POST http://localhost:5070/chat -d '{"message": "salva: meu cep é 01310-100"}' -H 'Content-Type: application/json'
# → tool_calls: [{ name: "memory_op", args: { action: "save_fact", ... }}]

# Multi-step (LLM pode chamar várias tools no mesmo turno)
curl -X POST http://localhost:5070/chat -d '{"message": "que horas são? e abre o youtube"}' -H 'Content-Type: application/json'
# → tool_calls: [{ system_info ... }, { browser_open ... }]
```

---

## Códigos de status

| Status | Significado |
|--------|-------------|
| `200` | OK (mesmo se a tool retornou `ok: false`) |
| `400` | Body inválido / faltam campos |
| `403` | Endpoint loopback-only acessado de fora |
| `404` | Tool ou rota não encontrada |
| `500` | Erro interno (verificar logs) |
