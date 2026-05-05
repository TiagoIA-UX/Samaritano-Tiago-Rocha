# Architecture — Kerneo Lite

Documento técnico do design. Pra hands-on, vai pra [TUTORIAL.md](../TUTORIAL.md).

---

## Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│                       BROWSER (GUI)                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Web Speech   │    │  Chat input  │    │ Audio player │   │
│  │   STT (PT)   │    │              │    │  (TTS MP3)   │   │
│  └──────┬───────┘    └──────┬───────┘    └──────▲───────┘   │
│         │                   │                   │           │
│         └────── HTTP ───────┴──── HTTP ─────────┘           │
└─────────────────────────────│───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVER (Node.js)                        │
│                                                              │
│  POST /chat ────► Orchestrator                              │
│                       │                                      │
│                       ├─► Reflex layer (regex match)         │
│                       │       └─► return em 0ms              │
│                       │                                      │
│                       ├─► MemoryStore (SQLite)               │
│                       │     ├─ facts (key/value)             │
│                       │     ├─ history (turnos)              │
│                       │     └─ sessions (last_plan)          │
│                       │                                      │
│                       ├─► OpenAI gpt-4o-mini                 │
│                       │     ├─ tool_choice: auto             │
│                       │     └─ max 5 iter (loop tool calls)  │
│                       │                                      │
│                       └─► ToolRegistry                       │
│                             ├─ browser_open                  │
│                             ├─ browser_search                │
│                             ├─ web_search (OpenAI/DDG)       │
│                             ├─ memory_op                     │
│                             ├─ file_io                       │
│                             └─ system_info                   │
│                                                              │
│  POST /tts ─────► OpenAI gpt-4o-mini-tts (stream MP3)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Fluxo de uma request

**Exemplo**: "pesquisa pizza no google"

1. **Browser**: Web Speech captura áudio → texto via Google STT (PT-BR) → `POST /chat`
2. **Server**: parseia body → chama `orchestrator.handleRequest()`
3. **Reflex**: testa patterns. Não match (verbo "pesquisa" não é saudação)
4. **Memory**: carrega últimas 6 turnos + top 10 facts → injeta no contexto
5. **LLM**: gpt-4o-mini recebe messages + tools schema
6. **LLM decide**: chamar `browser_search({ site: "google", query: "pizza" })`
7. **Executor**: roda tool → `child_process.spawn` abre Chrome
8. **LLM iter 2**: vê resultado da tool, gera resposta natural ("Pesquisando pizza no Google. Veja na tela.")
9. **Memory**: salva turno user + assistant
10. **Browser**: renderiza resposta + se input foi voz, faz `POST /tts` → toca MP3

**Latência típica** (cache warm):
- Reflex: ~10ms
- Tool call simples (browser_open): 500-800ms
- Tool com web_search: 2-4s
- TTS first byte: 300-500ms

---

## Decisões arquiteturais

### Por que **uma única OpenAI key**?
Reduz drasticamente fricção de setup. A GPT-4o cobre:
- LLM (planner + raciocínio)
- Vision (gpt-4o vision input)
- TTS (gpt-4o-mini-tts streaming)
- STT (gpt-4o-mini-transcribe, fallback browser)
- Web search (gpt-4o-search-preview)

Trade-off: lock-in OpenAI. Mas `src/llm/openai.js` é 1 arquivo — fácil de adaptar pra outros providers (veja TUTORIAL.md receita 4).

### Por que **Web Speech API > Whisper**?
- **Latência**: 0ms vs 500-1000ms (Whisper precisa upload + transcript)
- **Custo**: zero vs $0.006/min
- **Qualidade PT-BR**: Web Speech usa Google STT internamente (ótima)
- **Privacy**: áudio nunca sai do browser do user (mais privacy-friendly que enviar pra OpenAI)

Quando usar Whisper: se precisar STT em ambientes sem browser (CLI, mobile native), o `src/llm/openai.js` já tem `stt()` pronto.

### Por que **SQLite > Postgres/Redis**?
- Local-first: roda offline, sem servidor extra
- Zero config: arquivo `.db` é o "banco"
- WAL mode: leitura concorrente OK pra single-user
- Backup trivial: copia o arquivo

Pra multi-user em servidor, troca por Postgres é fácil — só mudar `src/memory/store.js`.

### Por que **vanilla JS na GUI**?
- Zero build step (instant dev cycle)
- Lê o código sem build mental de framework
- 200 linhas de JS cobrem tudo

Pra UI rica (markdown rendering, syntax highlight), considere migrar pra React/Vue, mas começa simples.

### Por que **reflex layer**?
Padrões obvious ("oi", "obrigado", "que horas são") não precisam de LLM call — economia de:
- Latência: ~1-2s por request
- Custo: ~$0.001 por request
- API rate limit: cada call OpenAI consome quota

Trade-off: adicionar pattern requer code change (não é dinâmico). Mas pra os 5-10 casos comuns, vale.

### Por que **auto-tool-calling**?
GPT-4o suporta `tools` parameter nativamente. Em vez de fazer planner separado decidir "qual tool", deixa o LLM decidir como parte do completion. Resultado:
- 1 round-trip ao invés de 2
- LLM tem contexto melhor pra decidir
- Multi-step natural (LLM pode chamar tool → ver resultado → chamar outra)

Trade-off: caps em max iter (5) pra evitar loops infinitos. Se LLM ficar em loop, retorna erro friendly.

---

## Limitações conhecidas

| Limitação | Workaround |
|-----------|-----------|
| OpenAI rate limits | Implementar retry com exponential backoff (não included pra simplicidade) |
| Web Speech só Chrome/Edge | Fallback Whisper via `/stt` endpoint (TODO) |
| LLM pode chamar tool errada | Tools com `description` clara + few-shot prompts no system |
| Memory cresce indefinidamente | Adicionar GC: deletar history > 1000 turnos antigos |
| Sem auth | Loopback-only por default. Pra LAN, ative HTTP token (não included) |

---

## Onde está cada coisa (TL;DR pra navegação)

```
src/server.js                    ← HTTP routes, boot
src/llm/openai.js                ← cliente OpenAI (chat, vision, tts, stt, search)
src/memory/store.js              ← SQLite: facts, history, sessions
src/orchestrator/index.js        ← cognitive loop (reflex → context → tool calling)
src/tools/registry.js            ← auto-discovery
src/tools/{browser,web,...}.js   ← tools individuais
src/voice/tts.js                 ← wrapper TTS streaming
public/                          ← GUI (HTML + CSS + JS)
```

Quer mexer no comportamento de "como decide chamar tool"? → `src/orchestrator/index.js`
Quer adicionar tool? → drop em `src/tools/*.js`
Quer trocar LLM provider? → `src/llm/openai.js` (1 arquivo)
Quer mudar GUI? → `public/index.html` + `public/app.js`

Cada coisa tem 1 lugar canônico. Sem distribuição mental.
