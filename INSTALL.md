# Instalação — Kerneo Lite (PC do zero)

Tempo estimado: **5-10 minutos** se você já tem Node.js. Senão, **15 minutos**.

Funciona em: **Windows · macOS · Linux**

---

## Pré-requisitos (1x na vida)

### 1. Node.js 20+

**Windows / macOS**:
1. Vai em https://nodejs.org
2. Baixa a versão **LTS** (recomendada — geralmente Node 20 ou 22)
3. Roda o instalador, "next, next, finish"
4. Abre um terminal novo (CMD, PowerShell, Terminal) e confere:
   ```bash
   node --version
   ```
   Tem que mostrar `v20.x.x` ou maior.

**Linux (Ubuntu/Debian)**:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

### 2. Chrome ou Edge

A interface usa **Web Speech API** pra reconhecer voz, que só funciona em Chrome/Edge.
- Firefox: chat funciona, mas o microfone não.
- Safari: parcial.
- **Recomendado: Chrome** (https://google.com/chrome).

### 3. (Opcional) Git

Se quiser clonar via git. Senão pula.
- Windows: https://git-scm.com/download/win
- macOS: já vem (`xcode-select --install`)
- Linux: `sudo apt install git`

---

## Passo a passo

### 1️⃣ Pega tua OpenAI API key

1. Vai em https://platform.openai.com/api-keys
2. Faz login (ou cria conta — leva 2 min, pede telefone)
3. Clica em **"Create new secret key"**
4. Dá um nome (ex: "Kerneo Lite") e copia a key (formato `sk-proj-...`)
5. **Guarda essa key bem** — só aparece uma vez!

⚠️ **Importante**: precisa ter **crédito na conta**. OpenAI dá $5 grátis pra contas novas (suficiente pra meses de uso casual). Senão, vai em [Billing](https://platform.openai.com/account/billing) e adiciona $5-10.

### 2️⃣ Baixa o código

**Opção A — via git (recomendado)**:
```bash
git clone https://github.com/vjdanilocoimbra/Kerneo.git
cd kerneo-lite
```

**Opção B — download ZIP**:
1. Acessa https://github.com/vjdanilocoimbra/Kerneo
2. Clica no botão verde **"Code"** → **"Download ZIP"**
3. Extrai o ZIP em alguma pasta (ex: `C:\Kerneo` ou `~/kerneo`)
4. Abre terminal naquela pasta:
   - **Windows**: shift+right-click na pasta → "Open in Terminal"
   - **macOS**: `cd ~/kerneo`
   - **Linux**: `cd ~/kerneo`

### 3️⃣ Instala as dependências

```bash
npm install
```

Vai baixar uns 80 pacotes em ~30 segundos. Se aparecer warning sobre "deprecated", ignora — é normal.

Resultado esperado:
```
added 77 packages, and audited 78 packages in 15s
found 0 vulnerabilities
```

### 4️⃣ Configura tua API key

**Windows (CMD ou PowerShell)**:
```bash
copy .env.example .env
notepad .env
```

**macOS / Linux**:
```bash
cp .env.example .env
nano .env       # ou use vim, code, etc
```

No editor, encontra a linha:
```
OPENAI_API_KEY=
```

E cola tua key depois do `=`:
```
OPENAI_API_KEY=sk-proj-AbCd1234EfGh5678...
```

**Salva e fecha** (no nano: Ctrl+X, Y, Enter).

### 5️⃣ Liga o servidor

```bash
npm start
```

Vai aparecer:
```
[17:30:00] INFO  [server] ═══════════════════════════════════════════════
[17:30:00] INFO  [server] ✅ Kerneo Lite online
[17:30:00] INFO  [server]    GUI:    http://127.0.0.1:5070/
[17:30:00] INFO  [server]    Health: http://127.0.0.1:5070/health
[17:30:00] INFO  [server]    Tools:  browser_open, browser_search, file_io, memory_op, system_info, web_search
[17:30:00] INFO  [server] ═══════════════════════════════════════════════
```

✅ **Pronto, está rodando!** Não fecha esse terminal.

### 6️⃣ Abre a interface

Abre o **Chrome** (ou Edge) e vai em:

```
http://localhost:5070
```

Você vai ver a interface do Kerneo:
- ⚡ Logo no topo
- Status verde (online · 6 tools)
- Caixa de chat
- Botão de microfone

---

## 🎙️ Permitindo o microfone (1x)

Quando você clica no microfone (ou aperta a barra de espaço), o Chrome vai pedir permissão pra microfone.

1. Aparece um popup "localhost quer usar seu microfone"
2. Clica em **"Permitir"**
3. Pronto, agora pode falar

⚠️ **Permissão precisa ser dada toda vez que abrir** se você usar `localhost` (alguns Chromes lembram, outros não). Pra ficar permanente, a página tem que ser HTTPS.

---

## ✅ Teste se está funcionando

Digite ou fale:

| Comando | O que deve acontecer |
|---------|---------------------|
| `oi` | Resposta instantânea (~10ms): "Oi! No que posso ajudar?" |
| `que horas são` | Mostra hora atual |
| `abre o youtube` | Chrome abre youtube.com em nova aba |
| `pesquisa pizza no google` | Chrome abre google.com/search?q=pizza |
| `salva: meu cep é 01310-100` | "Pronto, salvei seu CEP" |
| `lembra meu cep` | "Seu CEP é 01310-100" |

Se tudo isso funcionar, **está 100% rodando**.

---

## Como usar no dia-a-dia

### Falar
- **Clica no botão de microfone** OU
- **Segura a barra de espaço** (atalho rápido)
- Fala
- Solta — automaticamente envia
- Resposta volta como texto **e voz** (TTS)

### Digitar
- Foca no campo de texto
- Digita
- Aperta **Enter** pra enviar
- Resposta volta só como texto (sem TTS)

### Comandos úteis pra começar
- `que horas são` / `que dia é hoje`
- `abre o [site]` (gmail, youtube, github, netflix, etc)
- `pesquisa X no google` / `busca X no youtube`
- `pesquisa qual o preço de X` (web search com resposta sintetizada)
- `salva: minha info` / `lembra X`
- `lista facts` (mostra tudo que ele lembra de você)

### Pra parar
No terminal onde rodou `npm start`, aperta **Ctrl+C**.

---

## 🔧 Troubleshooting

### "OPENAI_API_KEY não configurada"
- O arquivo `.env` não foi criado ou está vazio.
- Verifica: o arquivo se chama exatamente `.env` (com ponto, sem extensão)?
- No Windows, pode aparecer "ENV" ou ".env.txt" — renomeia pra `.env`
- Confere se a key começa com `sk-proj-` ou `sk-`

### "Erro 401 / unauthorized"
- Tua key está inválida ou expirou
- Vai em https://platform.openai.com/api-keys e gera nova
- Cola no `.env` e salva

### "insufficient_quota"
- Sua conta OpenAI não tem crédito
- Adiciona em https://platform.openai.com/account/billing
- $5 dá pra meses de uso normal

### "Port 5070 already in use"
- Outra coisa está usando essa porta
- Edita `.env` e adiciona:
  ```
  PORT=5080
  ```
- Acessa em `http://localhost:5080`

### Microfone não funciona
- Você está no Chrome ou Edge? (Firefox/Safari não funcionam)
- Permitiu o microfone no popup do browser?
- Testa em outro site (https://www.google.com/search?q=teste+microfone) pra ver se o mic do PC está OK

### TTS sem áudio
- Áudio do sistema mutado?
- Browser bloqueou autoplay? Clica em qualquer lugar da página antes de falar (browser exige interação user antes de tocar áudio)

### "Cannot find module"
- Falta rodar `npm install`
- Roda de novo na pasta do projeto

### Página em branco / não carrega
- O servidor está rodando? (terminal mostra "✅ Kerneo Lite online"?)
- A URL é `http://localhost:5070` (com http, não https)?
- Tenta `http://127.0.0.1:5070` ao invés de `localhost`

### Resposta demora muito (>30s)
- Internet lenta?
- OpenAI está fora? https://status.openai.com
- Tenta pergunta mais simples ("oi") pra ver se reflex layer responde rápido

---

## Custo estimado

OpenAI cobra por uso. Estimativas pra uso casual:

| Uso | Custo/mês |
|-----|-----------|
| 50 mensagens/dia | ~$2-5 |
| 200 mensagens/dia | ~$8-15 |
| Voz (TTS) ativa | +$3-8 |

**Total esperado**: $5-20/mês com uso normal.

Pra economizar: usa modo texto (sem voz) — TTS é o que mais consome.

---

## Próximos passos

1. **Customiza** — leia [TUTORIAL.md](TUTORIAL.md) pra adicionar suas próprias tools
2. **Publica como app** — instala como PWA no Chrome (menu → "Instalar Kerneo")
3. **Compartilha na rede** — adiciona `KERNEO_BIND_LAN=1` no `.env` pra acessar do celular na mesma WiFi (use com cuidado!)
4. **Vira power-user** — vê [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pra entender como funciona

---

## Pra desenvolvedores

```bash
# Modo dev (auto-reload ao salvar)
npm run dev

# Roda smoke test (valida 8 fluxos)
npm test

# Logs detalhados
LOG_LEVEL=debug npm start
```

---

## Atualizando

```bash
git pull
npm install     # caso tenha deps novas
npm start
```

---

## Desinstalando

Só apaga a pasta. Tudo é local — não tem registro no Windows, lixo no /etc, etc.
A única coisa que sobra é sua API key na conta OpenAI (revoga em https://platform.openai.com/api-keys se quiser).

---

**Funcionou?** ⭐ Da estrela no GitHub.
**Travou?** Abre uma issue ou roda `npm test` pra debug.
