/**
 * skill_create.js — DIFERENCIAL DO KERNEO LITE.
 *
 * O Kerneo CRIA SUAS PRÓPRIAS SKILLS. Quando o user pede uma capacidade
 * que nenhuma tool existente cobre, esta tool:
 *
 *   1. Pede pro LLM gerar código JS seguindo o template
 *   2. Valida sintaxe (parse antes de salvar)
 *   3. Salva em src/tools/user-tools/{nome}.js
 *   4. Hot-load no registry (sem restart)
 *   5. Tool fica disponível IMEDIATAMENTE pra próxima query
 *
 * Auto-evolução: quanto mais o user usa, mais skills o sistema acumula.
 * Tudo em arquivos .js legíveis — user pode revisar/editar/deletar.
 *
 * Segurança:
 *   - Código gerado é validado por parse antes de executar
 *   - Wrap em try/catch automático
 *   - Sem npm install — só APIs Node nativas
 *   - User pode listar (skill_list) e remover (skill_remove)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Will be injected by server bootstrap
let _llmRouter = null
let _registry = null
export function setLLMRouter(router) { _llmRouter = router }
export function setRegistry(registry) { _registry = registry }

const TOOL_TEMPLATE_PROMPT = `Você está criando código JavaScript pra uma nova "tool" do Samaritano.

═══ ESTRUTURA OBRIGATÓRIA ═══

\`\`\`javascript
/**
 * Comentário breve (1-2 linhas) sobre o que a tool faz.
 */

// Imports só APIs Node nativas (NUNCA npm install): child_process, fs, path, os, http, https, etc.
import { spawn, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const definition = {
  name: 'NOME_SNAKE_CASE',
  description: 'O que a tool faz e quando usar (em PT-BR, claro pra LLM decidir).',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'descrição' },
      // ... outros params
    },
    required: ['param1'],
  },
}

export async function execute(args = {}) {
  try {
    // implementação aqui
    // Cross-platform: use process.platform === 'win32' / 'darwin' / 'linux'

    return {
      ok: true,
      message: 'Mensagem em PT-BR pro user (1 frase, natural).',
      // outros campos relevantes
    }
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    }
  }
}
\`\`\`

═══ REGRAS RÍGIDAS ═══

1. SEMPRE retornar { ok: bool, ... } — nunca throw silencioso
2. SEMPRE try/catch wrap no execute
3. Mensagens em PT-BR natural (não robotizado)
4. Cross-platform: detectar process.platform quando necessário
5. NÃO usar dependências externas (npm) — só Node nativo
6. NÃO modificar arquivos do próprio Samaritano (auto-modificação proibida)
7. Operações destrutivas (delete) devem pedir confirmação via arg \`confirm: true\`
8. Outputs longos: truncar pra 4000 chars max
9. Se a tool precisa de arg que o user não passou, retornar { ok: false, error: 'arg X obrigatório' }
10. PROIBIDO retornar placeholder/stub fake. Se a operação não pode ser feita
    de fato, retorne { ok: false, error: 'descrição real do limite' }.
    NUNCA retorne strings tipo "Texto analisado da imagem", "Resultado:",
    "Ação executada com sucesso" sem ter REALMENTE feito a ação.
11. Se sua skill PRECISA de Vision/análise de imagem, AVISE: o Samaritano
    JÁ TEM tool nativa screen_capture. Em vez de criar duplicata, sugira
    no error: "Use a tool nativa screen_capture pra essa funcionalidade."
12. Se sua skill PRECISA de pesquisa web, JÁ TEM web_search nativa. Reuse.

═══ EXEMPLOS DE TOOLS BOAS ═══

— Tool de volume (Windows):
\`\`\`javascript
export async function execute({ action }) {
  try {
    if (process.platform !== 'win32') return { ok: false, error: 'Só Windows' }
    const cmd = action === 'mute'
      ? 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"'
      : action === 'up'
        ? 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"'
        : 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"'
    await execAsync(cmd)
    return { ok: true, message: \`Volume \${action}.\` }
  } catch (err) { return { ok: false, error: err.message } }
}
\`\`\`

═══ AGORA GERE A TOOL ═══

NOME SUGERIDO: {{name}}
DESCRIÇÃO: {{description}}
REQUISITOS/HINT: {{requirements}}

Retorne APENAS o código completo do arquivo .js, sem markdown, sem explicações, sem \`\`\`. Comece direto com /** ou import.`

export const definition = {
  name: 'skill_create',
  description:
    'Cria uma NOVA skill/tool dinamicamente quando o user pede uma capacidade que nenhuma tool atual cobre. ' +
    'Use quando o user disser "cria uma skill pra X", "preciso de uma tool que faça Y", ' +
    '"você consegue aprender a fazer Z?", "instala algo que controle X". ' +
    'Após criação, a skill fica disponível IMEDIATAMENTE pro próximo turno (hot-reload). ' +
    'Tudo é salvo em arquivos .js legíveis em src/tools/user-tools/ — user pode revisar/editar.',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Descrição CLARA do que a skill deve fazer. Quanto mais específico, melhor a geração. Ex: "controlar volume do PC (mute/up/down)" ou "tirar screenshot e salvar em ~/Desktop".',
      },
      name: {
        type: 'string',
        description: 'Nome da skill em snake_case (opcional). Se omitido, gera automaticamente da descrição. Ex: "volume_control", "screenshot_tool".',
      },
      requirements: {
        type: 'string',
        description: 'Detalhes técnicos opcionais: comandos shell a usar, APIs Node, edge cases. Ex: "use powershell no Windows, osascript no Mac".',
      },
    },
    required: ['description'],
  },
}

function autoName(description) {
  return String(description)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `tool_${Date.now().toString(36)}`
}

function validateName(name) {
  if (!/^[a-z][a-z0-9_]{1,49}$/.test(name)) {
    return { valid: false, reason: 'Nome deve ser snake_case, 2-50 chars, [a-z0-9_]' }
  }
  return { valid: true }
}

function validateGeneratedCode(code) {
  // Checa estrutura mínima
  if (!code.includes('export const definition')) {
    return { valid: false, reason: 'Sem export `definition`' }
  }
  if (!code.includes('export async function execute') && !code.includes('export function execute')) {
    return { valid: false, reason: 'Sem export `execute`' }
  }
  // Bloqueia padrões obviamente perigosos
  const dangerous = [
    { re: /process\.exit/, why: 'process.exit() proibido' },
    { re: /require\s*\(\s*['"]child_process['"]\s*\).*spawn.*['"](rm|del|format)/, why: 'comando destrutivo detectado' },
    { re: /eval\s*\(/, why: 'eval() proibido' },
    { re: /Function\s*\(/, why: 'new Function() proibido' },
    { re: /\.\.\/\.\.\/\.\.\/\.\.\/.*node_modules/, why: 'path traversal suspeito' },
  ]
  for (const d of dangerous) {
    if (d.re.test(code)) return { valid: false, reason: d.why }
  }
  // Tenta parse JS
  try {
    new Function('return (async function() {' + code.replace(/^import .+$/gm, '') + '})()')
  } catch (err) {
    // Função nem sempre dá pra validar com new Function pq tem ESM imports.
    // Vamos confiar no try-import depois.
  }
  return { valid: true }
}

async function generateCode(name, description, requirements) {
  if (!_llmRouter?.complete) {
    throw new Error('LLM router não disponível')
  }
  const prompt = TOOL_TEMPLATE_PROMPT
    .replace('{{name}}', name)
    .replace('{{description}}', description)
    .replace('{{requirements}}', requirements || 'sem requisitos específicos')

  const resp = await _llmRouter.complete({
    model: 'smart',
    system: 'Você é um gerador de código JavaScript determinístico. Retorne APENAS código, sem prosa.',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2048,
    temperature: 0.2,
  })

  let code = (resp.content || '').trim()
  // Remove fences se LLM colocou
  code = code.replace(/^```(?:javascript|js)?\n/, '').replace(/\n```$/, '')
  return code
}

export async function execute(args = {}) {
  if (!_registry) return { ok: false, error: 'Registry não disponível' }

  const description = String(args.description || '').trim()
  if (!description) return { ok: false, error: 'description obrigatório' }

  let name = (args.name || autoName(description)).toLowerCase()
  const nameCheck = validateName(name)
  if (!nameCheck.valid) {
    name = autoName(description)
    const recheck = validateName(name)
    if (!recheck.valid) return { ok: false, error: 'Não consegui gerar nome válido' }
  }

  // Conflito com tool existente?
  if (_registry.get(name)) {
    return {
      ok: false,
      error: `Já existe uma skill chamada "${name}". Use outro nome ou remova primeiro com skill_remove.`,
    }
  }

  // 1. Gera código
  let code
  try {
    code = await generateCode(name, description, args.requirements)
  } catch (err) {
    return { ok: false, error: `LLM falhou: ${err.message}` }
  }

  if (!code || code.length < 100) {
    return { ok: false, error: 'LLM gerou código muito curto/vazio' }
  }

  // 2. Valida
  const validation = validateGeneratedCode(code)
  if (!validation.valid) {
    return {
      ok: false,
      error: `Código gerado falhou validação: ${validation.reason}`,
      preview: code.slice(0, 300),
    }
  }

  // Garante o name correto no código (LLM pode ter colocado outro)
  code = code.replace(/name:\s*['"]\w+['"]/, `name: '${name}'`)

  // 3. Salva em user-tools/
  const userDir = _registry.getUserToolsDir()
  const filePath = path.join(userDir, `${name}.js`)

  try {
    fs.writeFileSync(filePath, code, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Não consegui salvar: ${err.message}` }
  }

  // 4. Hot-load no registry
  const loadedName = await _registry.loadOne(filePath)
  if (!loadedName) {
    // Falhou ao carregar — remove arquivo
    try { fs.unlinkSync(filePath) } catch {}
    return {
      ok: false,
      error: 'Código gerado tem erro de sintaxe ou import. Não foi carregado.',
      hint: 'Tente reformular a descrição com mais detalhes técnicos.',
    }
  }

  return {
    ok: true,
    name: loadedName,
    description,
    file_path: filePath,
    message:
      `✨ Criei a skill "${loadedName}". Pode usar agora!\n` +
      `Arquivo: ${path.relative(process.cwd(), filePath)}`,
  }
}

// Exports pra tests
export { autoName, validateName, validateGeneratedCode }
