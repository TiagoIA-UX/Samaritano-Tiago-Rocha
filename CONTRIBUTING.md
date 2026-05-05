# Contribuindo com Kerneo Lite

Obrigado por querer ajudar! Esse projeto **vive** da comunidade.

## 🎯 Filosofia

> "O assistente que aprende a fazer o que você pede.
>  Sem código, sem terminal, em português."

Mantemos isso simples:
- Código fácil de ler (sem magia)
- Setup pra leigos (sem fricção)
- Skills compartilháveis (cada uma é 1 arquivo `.js`)
- Multi-provider (não dependemos de 1 empresa)

---

## 🤝 Como ajudar

### 1. Reportar bug

Abre uma [issue](../../issues/new) com:
- O que você fez
- O que esperava
- O que aconteceu
- Saída do `troubleshoot.bat` (rode e cola o `diagnostico.txt`)
- OS + versão do Node

### 2. Sugerir feature

Issue com label `enhancement`. Mais útil:
- Caso de uso real (não "seria legal se...")
- Como funcionaria pra leigo

### 3. Compartilhar skill criada

A galera vai criar skills incríveis. Compartilha!

**Caminho fácil**:
1. No Kerneo: `exporta a skill nome_da_skill`
2. Cola o código num [Gist público](https://gist.github.com)
3. Compartilha o link
4. Outros usam: `instala a skill desse link: https://...`

**Caminho pro repo oficial** (vira built-in):
1. Fork do repo
2. Cria pasta em `community-skills/sua_skill/`
3. Adiciona `sua_skill.js` + `README.md` (descrição, OS, exemplos)
4. PR

### 4. Pull Request (código)

```bash
git clone https://github.com/vjdanilocoimbra/Kerneo.git
cd kerneo-lite
npm install
npm test         # smoke test (8 queries)
npm start        # roda local pra testar manual
```

Padrão:
- Prefere arquivos pequenos e focados
- Nunca quebra retrocompatibilidade sem MAJOR version bump
- Tools sempre retornam `{ ok: bool, ... }`
- Mensagens em PT-BR (PR pode ser em EN)

---

## 📐 Estrutura

```
src/
├── server.js              ← entrypoint HTTP+HTTPS
├── orchestrator/          ← cognitive loop
├── tools/                 ← tools nativas (1 arquivo = 1 tool)
│   └── user-tools/        ← skills criadas dinamicamente (gitignored)
├── llm/                   ← multi-provider router
├── memory/                ← SQLite persistente
├── voice/                 ← TTS streaming
└── utils/                 ← config, certs, logger

public/                    ← GUI vanilla
tests/                     ← smoke + unit
```

## 🛠️ Como criar uma tool nova

Crie `src/tools/minha_tool.js`:

```js
/**
 * Comentário breve do que faz.
 */

export const definition = {
  name: 'minha_tool',
  description: 'O que ela faz e quando o LLM deve usar (em PT-BR claro)',
  parameters: {
    type: 'object',
    properties: {
      arg1: { type: 'string', description: 'descrição' },
    },
    required: ['arg1'],
  },
}

export async function execute(args = {}) {
  try {
    // implementação
    return { ok: true, message: 'Pronto!' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
```

Reinicia o servidor e ela aparece automaticamente. **Sem registro manual.**

## 🚫 O que NÃO fazer

- ❌ Adicionar dependências npm sem necessidade real
- ❌ Quebrar API HTTP existente sem versionar
- ❌ Hardcode de keys/secrets em código
- ❌ Funcionalidades que só funcionam num provider específico (sem fallback)
- ❌ Comandos destrutivos sem `confirm: true` em args
- ❌ Esquecer mensagens em PT-BR

## ✅ O que sempre fazer

- ✅ Tools cross-platform (detect `process.platform`)
- ✅ Try/catch wrap em `execute`
- ✅ Mensagens claras pra leigo
- ✅ Smoke test passa (`npm test`)
- ✅ Sem warnings novos no console

---

## 🌐 Comunidade

- **Discord**: (em breve)
- **GitHub Discussions**: (em breve)
- **Issues**: pra bugs e features

---

## 📜 Code of Conduct (versão curta)

Seja gentil. Diversidade é boa. Crítica construtiva é bem-vinda; ataque pessoal não. Sem assédio, sem discriminação. Se algo não tá legal, [reporta](mailto:CONTATO).

Versão completa: [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

---

## 🙌 Agradecimentos

Cada skill compartilhada, cada bug reportado, cada PR aceito faz o Kerneo Lite melhor pra **todo mundo**. Obrigado.
