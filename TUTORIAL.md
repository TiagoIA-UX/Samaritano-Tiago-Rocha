# Tutorial — estendendo Kerneo Lite com IA

Esse projeto foi construído inteiro com IA-assisted dev. Funciona com qualquer LLM-IDE: **Claude Code, Cursor, Cline, Aider, GitHub Copilot Workspace, VSCode + LLM extension**.

A ideia é: você descreve o que quer em PT-BR, o LLM olha o código existente e gera o que falta seguindo o padrão.

---

## Como o LLM "lê" esse projeto

Convenções que ajudam o LLM a entender:

1. **Comentários de cabeçalho explicam o "porquê"** de cada arquivo, não só o "o quê"
2. **`CLAUDE.md` (ou seu equivalente)** na raiz pode dar instruções globais ao LLM
3. **Tools são auto-discoverable**: drop em `src/tools/` → registra automaticamente
4. **Padrão consistente**: cada tool tem `definition` (pra LLM) + `execute` (lógica)
5. **Erros gracefuls**: tools sempre retornam `{ ok: bool, ... }`, nunca throw silencioso

---

## Receita 1 — adicionar uma tool nova

**Cenário**: você quer um tool que abre Spotify e toca uma música.

**Passo 1**: cria `src/tools/spotify_play.js`:

```js
/**
 * spotify_play.js — Abre Spotify com URI de busca/play.
 */

import { spawn } from 'child_process'

export const definition = {
  name: 'spotify_play',
  description: 'Abre Spotify Web e busca/toca uma música. Use pra "toca X no spotify".',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Nome da música/artista' },
    },
    required: ['query'],
  },
}

export async function execute({ query }) {
  if (!query) return { ok: false, error: 'query obrigatória' }
  const url = `https://open.spotify.com/search/${encodeURIComponent(query)}`
  // Use seu LLM-IDE pra adaptar pro padrão de browser_open.js
  // (spawn, win32 vs darwin, etc)
  return { ok: true, url, message: `Abrindo Spotify com busca por "${query}".` }
}
```

**Passo 2**: reinicia (`npm start`). A tool é auto-descoberta.

**Passo 3**: testa via /chat:
```
"toca Daft Punk no spotify"
```

O LLM (gpt-4o-mini) vai automaticamente chamar `spotify_play({query: "Daft Punk"})`.

---

## Receita 2 — modificar com Claude Code

```
$ cd kerneo-lite
$ claude   # ou cursor . ou code .

[no Claude Code]
> Quero adicionar uma tool que controla play/pause do Spotify
> via Spotify Web Playback SDK. Olha o pattern em src/tools/browser_open.js
> e cria src/tools/spotify_control.js que aceite action=play|pause|next|prev.
> Não precisa de OAuth ainda — só abre URL com hash apropriado.
```

O LLM vai:
1. Ler `src/tools/browser_open.js` pra pegar o pattern
2. Criar `src/tools/spotify_control.js` seguindo a mesma estrutura
3. Te perguntar se quer que valide

---

## Receita 3 — adicionar reflex pattern (zero-LLM fast path)

Em `src/orchestrator/index.js`, há `REFLEX_PATTERNS`:

```js
{
  re: /^(qual\s+seu\s+nome|seu\s+nome)\s*[?!.]*$/i,
  fn: () => 'Sou o Kerneo, seu assistente.',
}
```

Pra adicionar fast-path "que dia é hoje":

```js
{
  re: /^(que\s+dia|qual\s+(?:o\s+)?dia)\s+(?:é\s+|de\s+)?hoje[?!.]*$/i,
  fn: () => {
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    return `📅 Hoje é ${d}.`
  },
}
```

Vantagem: 0ms de latência, custo zero. Use pra perguntas óbvias e frequentes.

---

## Receita 4 — mudar o LLM por trás

Editar `src/llm/openai.js`:

```js
const MODELS = {
  fast:   'gpt-4o-mini',     // ← mude pra 'gpt-4-turbo' se preferir
  smart:  'gpt-4o',
  ...
}
```

Ou via env (`.env`):
```bash
OPENAI_MODEL_FAST=gpt-4-turbo
```

Pra usar Anthropic Claude ou Ollama local, peça pro seu LLM-IDE:

```
> Adapta src/llm/openai.js pra suportar Anthropic via env ANTHROPIC_API_KEY.
> Mantém OpenAI como default. Cria função `chat()` que detecta provider
> automaticamente e usa o adapter certo.
```

---

## Receita 5 — adicionar persona

Crie `src/orchestrator/persona.js`:

```js
export const PERSONAS = {
  default: `Você é Kerneo, assistente pessoal AI brasileiro.
Conciso, direto, sem rodeios.`,

  jarvis: `Você é JARVIS, mordomo digital britânico do estilo Iron Man.
Formal mas com calor humano. Frases curtas. Use "senhor" ocasionalmente.
Calmo sob pressão.`,

  amigo: `Você é um amigo descontraído ajudando com tasks.
Use gírias brasileiras leves. Linguagem informal mas profissional.`,
}
```

E em `src/orchestrator/index.js`, troca `SYSTEM_PROMPT` por:

```js
import { PERSONAS } from './persona.js'
const SYSTEM_PROMPT = PERSONAS[process.env.PERSONA || 'default']
```

Restart com:
```bash
PERSONA=jarvis npm start
```

---

## Cuidados ao usar IA pra modificar código

✅ **Faça**:
- Peça pro LLM **ler arquivos similares** antes de criar novos (é a parte do "siga o padrão de X")
- Valide o que ele gera com `npm test` antes de commitar
- Use comentários de Sprint/data pra dar contexto histórico

❌ **Evite**:
- "Re-escreve tudo" — quebra incrementally é mais seguro
- Aceitar mudanças sem ler — LLMs erram em edge cases
- Não testar voz/UI manualmente — alguns bugs só aparecem no browser

---

## Estrutura mental do projeto

```
src/
├── server.js          ← entrypoint, HTTP routes
├── llm/               ← cliente OpenAI (única dep externa LLM)
├── memory/            ← SQLite (facts, history, sessions)
├── orchestrator/      ← cognitive loop (reflex + tool calling)
├── tools/             ← auto-discovered, drop file = nova tool
├── voice/             ← TTS streaming
└── utils/             ← logger, helpers

public/                ← GUI vanilla, sem build
└── (HTML + CSS + JS)
```

Mantém simples. Se for adicionar algo grande (auth, multi-user, plugins), considera:
1. Pasta separada (`src/plugins/`)
2. Config-driven (`config.json` controla o que carrega)
3. Comentário explicando POR QUE existe esse novo módulo

---

## Próximos passos sugeridos

- [ ] **MCP support**: bridge pra `@modelcontextprotocol/sdk` — habilita filesystem, git, postgres, etc
- [ ] **Multi-LLM**: Anthropic/Ollama como fallback (Q&D: copia `src/llm/openai.js` → `anthropic.js`, switch em `src/llm/index.js`)
- [ ] **Skills cache**: regex-match queries comuns pra plano cacheado (evita re-planning toda vez)
- [ ] **Auth layer**: HTTP basic ou JWT pra expor LAN

Tudo isso o LLM-IDE consegue te ajudar a implementar. Boa hackathon!
