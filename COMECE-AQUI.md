# Comece aqui — Kerneo Lite v0.3

> Pra galera que quer **só usar**. Sem terminal, sem código.
> Tempo total: 3-5 minutos.

## ⚡ O DIFERENCIAL: o Kerneo cria suas próprias skills

Diferente de outros assistentes, o Kerneo **AUTO-EVOLUI**:
- Você pede uma capacidade que ele não tem ainda → ele **cria a skill na hora**
- Skill fica disponível IMEDIATAMENTE pro próximo turno (hot-reload)
- Tudo fica em arquivos `.js` legíveis em `src/tools/user-tools/` — você pode revisar, editar, deletar

**Exemplo real**:
```
Você: "cria uma skill que controla o volume do PC"
Kerneo: ✨ Criei a skill "volume_control". Pode usar agora!

Você: "abaixa o volume"
Kerneo: Volume diminuído com sucesso.
```

---

## 🆕 Novidades v0.3

| Recurso | Descrição |
|---------|-----------|
| ✨ **Auto-evolução** | `skill_create`, `skill_list`, `skill_remove` — Kerneo cria suas próprias skills |
| 🔌 **Multi-provider** | OpenAI, Anthropic, DeepSeek, Groq, Gemini, OpenRouter, Ollama (local) e qualquer API compatível |
| 📋 **`config.json`** | Configuração avançada estruturada (em vez de só `.env`) |
| 🔒 **HTTPS auto** | Cert self-signed gerado na primeira run |
| 🖥️ **App vs site** | "abre calculadora" ≠ "abre youtube" — diferenciação inteligente |
| 🎙️ **Mic robusto** | State machine + fallback Whisper se Web Speech falhar |

---

## Windows — instalação em 4 passos

### 1. Instala Node.js (1ª vez na vida)
- https://nodejs.org → botão verde "LTS" → next, next, finish

### 2. Copia a pasta `kerneo-lite` pro PC
- Não rode direto do pendrive — pra `C:\Kerneo` ou Documentos

### 3. Double-click em `install.bat`
O instalador profissional faz tudo automaticamente.

### 4. Cola tua API key quando pedir
- Padrão: **OpenAI** (recomendado, cobre LLM + voz + visão com 1 chave)
- Site abre auto em https://platform.openai.com/api-keys

---

## 🔌 Quero usar OUTRO provider (Anthropic, Groq, Ollama, etc)?

**Sim, dá!** O Kerneo Lite suporta qualquer API compatível.

Caminho do arquivo:
```
[pasta-kerneo]\config.json
```

Edite a seção `providers` e preencha a `apiKey` do que quiser:

```json
{
  "provider": "auto",
  "providers": {
    "openai": { "apiKey": "sk-..." },
    "anthropic": { "apiKey": "sk-ant-..." },
    "deepseek": { "apiKey": "sk-..." },
    "groq": { "apiKey": "gsk_..." },
    "gemini": { "apiKey": "AIza..." },
    "openrouter": { "apiKey": "sk-or-..." },
    "ollama": { "baseUrl": "http://localhost:11434/v1" }
  }
}
```

**Como funciona**:
- `provider: "auto"` → usa o primeiro com `apiKey` preenchida
- `provider: "anthropic"` → força Claude
- Reinicia o Kerneo (`start.bat`) e ele detecta automaticamente

**Ordem de preferência (auto)**: openai → anthropic → deepseek → groq → openrouter → gemini → ollama

**Onde pegar cada uma**:
| Provider | URL | Free? |
|----------|-----|-------|
| OpenAI | https://platform.openai.com/api-keys | Pay-as-you-go |
| Anthropic | https://console.anthropic.com/ | Pay-as-you-go |
| Groq | https://console.groq.com/ | ✅ Free tier |
| Gemini | https://aistudio.google.com/apikey | ✅ Free tier |
| DeepSeek | https://platform.deepseek.com/ | ✅ Barato |
| OpenRouter | https://openrouter.ai/keys | Mix grátis/pago |
| Ollama | https://ollama.com (instalar local) | ✅ 100% offline |

---

## Pra usar de novo (depois da instalação)

Double-click em **`start.bat`** ⚡

---

## Como usar

| Ação | Como |
|------|------|
| **Falar** | Segura **espaço** (push-to-talk) ou clica no mic |
| **Digitar** | Foca no campo, digita, **Enter** |

Use **Chrome** ou **Edge** — Firefox tem fallback Whisper mas mais lento.

---

## Comandos pra testar

### Apps nativos (abre o programa do Windows)
```
abre a calculadora
abre o bloco de notas
abre o paint
abre o vscode
abre as configurações
```

### Sites web (abre no navegador)
```
abre o youtube
abre meu gmail
abre o github
```

### Pesquisa
```
pesquisa pizza no google
busca tenis no mercado livre
preço do bitcoin hoje
quem é o presidente do Brasil
```

### Memória
```
salva: meu cep é 01310-100
lembra meu cep
```

### ✨ Auto-evolução (novo!)
```
quais skills você tem?
cria uma skill que tira screenshot
cria uma skill que abre minhas notas no obsidian
remove a skill volume_control
```

---

## 🔒 HTTPS — tirar o aviso "Não é privado"

Quando abrir https://localhost:5071 pela 1ª vez:
1. Aparece "Sua conexão não é particular" (esperado, cert self-signed)
2. Clica **"Avançado"** → **"Continuar para localhost"**
3. Pronto — pra mic é mais estável

HTTP em http://localhost:5070 também funciona (Chrome trata localhost como secure).

---

## Algo deu errado?

### 1ª opção: rode `troubleshoot.bat`
Gera `diagnostico.txt` com TUDO sobre teu sistema (provider ativo, tools carregadas, paths, etc).

### Erros comuns

| Problema | Solução |
|----------|---------|
| "Nenhum provider LLM configurado" | Edite `.env` ou `config.json` com pelo menos 1 apiKey |
| "401 unauthorized" | Tua key foi rejeitada — gera nova ou troca de provider |
| "Sem crédito" | Adiciona crédito no provider OU troca pra Groq/Gemini (free tier) |
| Mic vermelho mas nada acontece | v0.3 tem fallback Whisper auto. Se Web Speech falhar 2x, usa servidor STT |
| "Conexão não é segura" | Use HTTPS (https://localhost:5071) ou ignore — HTTP em localhost é secure context |
| Janela CMD com erros estranhos | Está usando v0.1 (bug). Atualize pro v0.3 |

---

## Estrutura do projeto

```
kerneo-lite/
├── install.bat           ← double-click pra instalar
├── start.bat             ← double-click pra rodar
├── troubleshoot.bat      ← double-click se der erro
├── COMECE-AQUI.md        ← este arquivo
├── README.md             ← detalhes técnicos
├── TUTORIAL.md           ← extender com IA
├── .env                  ← config simples (1 key)
├── config.json           ← config avançada (multi-provider)
├── src/
│   ├── server.js         ← entrypoint (HTTP+HTTPS)
│   ├── orchestrator/     ← cognitive loop
│   ├── tools/            ← 10 tools nativas
│   │   └── user-tools/   ← ✨ skills criadas dinamicamente
│   ├── llm/index.js      ← router multi-provider
│   ├── memory/store.js   ← SQLite
│   └── utils/            ← config + certs + logger
└── public/               ← GUI (HTML/CSS/JS vanilla)
```

---

## Custo estimado

Depende do provider:
- **OpenAI**: ~$2-20/mês (pago por uso)
- **Groq**: 0 (free tier generoso)
- **Gemini**: 0 (free tier)
- **Ollama** (local): 0 (mas precisa GPU/CPU bom)
- **DeepSeek**: ~$0.50-3/mês

Pra modo voz, OpenAI é necessário (TTS/STT). Outros providers não têm voice nativo.

---

## Pra desenvolvedores

```bash
npm test           # smoke test
npm run dev        # auto-reload
LOG_LEVEL=debug npm start
```

Veja [TUTORIAL.md](TUTORIAL.md) pra extender. Mas honestamente, o melhor jeito é **pedir pro Kerneo criar a skill que você quer** — e ele faz.

---

## 🎯 Filosofia

> "Se algo não está coberto, ele aprende. Você não programa um assistente — você o **ensina**."

Cada skill criada é um arquivo `.js` real em `src/tools/user-tools/`. Você pode:
- Revisar o código antes de aceitar
- Editar manualmente pra ajustar
- Versionar com git
- Compartilhar skills boas com outras pessoas

**Travou?** Roda `troubleshoot.bat` e lê `diagnostico.txt`. 95% dos casos é uma das coisas listadas.
