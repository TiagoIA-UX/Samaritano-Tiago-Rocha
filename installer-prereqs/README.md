# 🛠️ Pré-instalador Kerneo

> **Instala automaticamente Node.js 20+, Python 3.12+ e ffmpeg.**
> Pra quem não quer instalar manualmente os pré-requisitos.

---

## 🎯 Qual usar?

Tem **2 opções**, escolha a que preferir:

| Opção | Como usar | Tamanho | Pra quem |
|-------|-----------|---------|----------|
| 🟢 **`Verificar_Requisitos.exe`** | Double-click | 88 KB | **Recomendado** — leigos, sem complicação |
| 🔧 `Kerneo_Requisitos.bat` + `.ps1` | Double-click no `.bat` | 32 KB | Quem quer ver/auditar código antes |

---

## 🚀 Caminho mais fácil: `.exe`

### Windows

1. **Double-click em `Verificar_Requisitos.exe`**
2. Vai pedir permissão de administrador → clique **"Sim"**
3. Interface gráfica abre mostrando o que falta:
   ```
   ┌──────────────────────────────────────────┐
   │   Verificador de Requisitos              │
   ├──────────────────────────────────────────┤
   │   COMPONENTE   STATUS                    │
   │   Python       [verificar]               │
   │   Node.js      [verificar]               │
   │   ffmpeg       [verificar]               │
   └──────────────────────────────────────────┘
   ```
4. Clica em **VERIFICAR** → mostra o que tá instalado
5. Clica em **INSTALAR FALTANDO** → instala automaticamente o que falta
6. Pronto. Agora pode rodar `install.bat` do Kerneo Lite.

⚠️ **Windows Defender pode avisar** que é arquivo desconhecido. Clique **"Mais informações" → "Executar mesmo assim"**. É normal pra `.exe` não-assinados.

---

## 🔧 Caminho alternativo: `.bat` + `.ps1`

Pra quem prefere **ver o código antes de rodar**:

1. Abre `kerneo_requisitos.ps1` no Bloco de Notas (lê o que ele faz)
2. Double-click em `Kerneo_Requisitos.bat`
3. Mesmo fluxo — interface gráfica, verificar, instalar

**Vantagem**: você lê o código antes. **Desvantagem**: requer PowerShell habilitado (já vem por padrão em Win 10+).

---

## 📋 O que ele instala

| Componente | Versão alvo | Necessário pra |
|------------|-------------|----------------|
| **Node.js** | 20+ LTS | ✅ Kerneo Lite (obrigatório) |
| **Python** | 3.12+ | ⚠️ Opcional (se usar Pacote Completo no futuro) |
| **ffmpeg** | 4.0+ | ⚠️ Opcional (processamento áudio/vídeo) |

> Se você só vai usar a **versão Lite**, só precisa do Node.js. Mas instalar os 3 de uma vez evita ter que fazer de novo depois.

---

## 🛡️ É seguro?

Sim. O instalador:

- ✅ Usa **winget** (gerenciador oficial da Microsoft)
- ✅ Baixa apenas dos sites oficiais (python.org, nodejs.org, gyan.dev/ffmpeg)
- ✅ Não modifica configurações além das necessárias
- ✅ Pede confirmação pra cada ação
- ✅ É **open source** (versão `.ps1` aqui no repo)

O `.exe` é apenas um wrapper compilado do `.ps1` — mesma lógica, embalagem diferente.

---

## 🐧 Mac / Linux

Esse instalador é **Windows-only**. Em Mac/Linux, use os gerenciadores nativos:

### macOS (com Homebrew)

```bash
brew install node@20 python@3.12 ffmpeg
```

### Linux (Ubuntu/Debian)

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Python 3.12 + ffmpeg (opcional)
sudo apt install -y python3 python3-pip ffmpeg
```

---

## 🆘 Problemas comuns

### "Execução de scripts foi desabilitada" (no `.bat`)

Use o **`.exe`** (não tem essa restrição). Ou então, como administrador:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "winget não foi reconhecido"

Versão antiga do Windows. Atualize via **Microsoft Store** → "App Installer" → Atualizar.

OU instala manualmente via:
- Node.js: https://nodejs.org → LTS
- Python: https://python.org → 3.12
- ffmpeg: https://www.gyan.dev/ffmpeg/builds/ (extrai e adiciona ao PATH)

### "SmartScreen bloqueou o `.exe`"

É comum pra executáveis sem assinatura digital. Clica:
1. **"Mais informações"** (texto pequeno)
2. **"Executar mesmo assim"**

Ou use a versão `.bat` + `.ps1`.

### "Antivírus bloqueou"

Falso positivo (executáveis novos sem reputação são marcados). Adicione exceção temporária OU use a versão `.bat`+`.ps1` (que é texto puro, antivírus não bloqueia).

---

## 📦 Estrutura

```
installer-prereqs/
├── Verificar_Requisitos.exe   ← caminho fácil (recomendado)
├── Kerneo_Requisitos.bat       ← wrapper PowerShell
├── kerneo_requisitos.ps1       ← lógica (open source)
└── README.md                    ← este arquivo
```

---

## 📚 Origem

Adaptado do **NEXUS Installer** (originalmente do Danilo Coimbra pra outro projeto). Open source, MIT.
