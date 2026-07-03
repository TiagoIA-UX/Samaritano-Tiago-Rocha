/**
 * skill_iterate.js — Refaz uma skill que está com bug ou que o user quer melhorar.
 *
 * Use quando:
 *   - User diz "a skill X não funcionou, refaz"
 *   - User quer melhorar uma skill existente: "deixa a skill X mais robusta"
 *   - Skill criada falhou com erro e o user quer outra tentativa
 *
 * Pipeline:
 *   1. Lê código atual da skill
 *   2. Pega histórico recente (último erro, se houver)
 *   3. Manda pro LLM gerar nova versão corrigida
 *   4. Backup do antigo em `<name>.backup.js`
 *   5. Hot-reload no registry
 */

import fs from 'fs'
import path from 'path'

let _llmRouter = null
let _registry = null
export function setLLMRouter(router) { _llmRouter = router }
export function setRegistry(registry) { _registry = registry }

const ITERATE_PROMPT = `Você está MELHORANDO uma skill existente do Samaritano que tinha um problema.

═══ CÓDIGO ATUAL DA SKILL ═══
\`\`\`javascript
{{currentCode}}
\`\`\`

═══ FEEDBACK / PROBLEMA ═══
{{feedback}}

═══ INSTRUÇÕES ═══

Reescreva o código completo corrigindo o problema. Mantenha:
- Mesmo nome (\`name\`)
- Mesma estrutura (export definition + execute)
- Try/catch wrap
- Cross-platform quando necessário
- Retorno { ok: bool, message: '...', error: '...' }

Melhore:
- Tratamento de erros (mais específico)
- Edge cases (params vazios, sistema sem o programa, etc)
- Mensagens claras em PT-BR

NÃO mude:
- O nome da tool
- A interface (parâmetros)

NÃO use:
- npm install / dependências externas
- eval / Function dinâmica
- process.exit
- comandos destrutivos sem confirmação

Retorne APENAS o código completo do arquivo .js, sem markdown, sem explicações.`

export const definition = {
  name: 'skill_iterate',
  description: 'Refaz/melhora uma skill existente quando ela tem bug ou o user quer aprimorá-la. Use quando user disser "a skill X não funcionou, refaz", "melhora a skill Y", "tenta de novo a skill Z com mais robustez". Mantém o nome original mas reescreve o código.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome da skill a refazer (case-sensitive)' },
      feedback: {
        type: 'string',
        description: 'O que melhorar / qual foi o erro / o que o user pediu mais. Quanto mais detalhado, melhor a iteração.',
      },
    },
    required: ['name'],
  },
}

function validateGeneratedCode(code) {
  if (!code.includes('export const definition')) return { valid: false, reason: 'Sem export definition' }
  if (!code.includes('export async function execute') && !code.includes('export function execute')) {
    return { valid: false, reason: 'Sem export execute' }
  }
  const blocked = [
    /process\.exit\s*\(/,
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /\bnpm\s+install\b/,
  ]
  for (const re of blocked) {
    if (re.test(code)) return { valid: false, reason: `Padrão proibido: ${re}` }
  }
  return { valid: true }
}

export async function execute({ name, feedback = 'corrija o problema, deixa mais robusta' } = {}) {
  if (!_registry) return { ok: false, error: 'Registry não disponível' }
  if (!name) return { ok: false, error: 'name obrigatório' }

  const entry = _registry.get(name)
  if (!entry) return { ok: false, error: `Skill "${name}" não existe.` }

  // Só permite iterar user-tools (nativas são do projeto)
  const isUserCreated = entry.filePath?.includes('user-tools')
  if (!isUserCreated) {
    return {
      ok: false,
      error: `"${name}" é uma skill nativa. Não posso reescrever — é parte do core do Samaritano.`,
    }
  }

  // Lê código atual
  let currentCode
  try {
    currentCode = fs.readFileSync(entry.filePath, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Falha ao ler skill: ${err.message}` }
  }

  // Gera nova versão
  if (!_llmRouter?.complete) return { ok: false, error: 'LLM não disponível' }

  const prompt = ITERATE_PROMPT
    .replace('{{currentCode}}', currentCode)
    .replace('{{feedback}}', feedback)

  let newCode
  try {
    const resp = await _llmRouter.complete({
      model: 'smart',
      system: 'Você é um gerador de código JavaScript determinístico. Retorne APENAS código.',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.2,
    })
    newCode = (resp.content || '').trim().replace(/^```(?:javascript|js)?\n/, '').replace(/\n```$/, '')
  } catch (err) {
    return { ok: false, error: `LLM falhou: ${err.message}` }
  }

  if (!newCode || newCode.length < 100) {
    return { ok: false, error: 'LLM gerou código vazio/curto' }
  }

  const validation = validateGeneratedCode(newCode)
  if (!validation.valid) {
    return { ok: false, error: `Código inválido: ${validation.reason}` }
  }

  // Garante o nome correto
  newCode = newCode.replace(/name:\s*['"]\w+['"]/, `name: '${name}'`)

  // Backup do antigo
  const backupPath = entry.filePath + '.backup'
  try {
    fs.writeFileSync(backupPath, currentCode, 'utf-8')
  } catch {}

  // Salva nova versão
  try {
    fs.writeFileSync(entry.filePath, newCode, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Falha ao salvar: ${err.message}` }
  }

  // Hot-reload (overwrite)
  await _registry.unload(name)
  const reloaded = await _registry.loadOne(entry.filePath)
  if (!reloaded) {
    // Falhou — restaura backup
    try { fs.copyFileSync(backupPath, entry.filePath) } catch {}
    await _registry.loadOne(entry.filePath)
    return {
      ok: false,
      error: 'Nova versão tem erro de sintaxe — restaurei a anterior.',
      hint: 'Tente reformular o feedback com mais detalhes.',
    }
  }

  return {
    ok: true,
    name,
    backup_path: backupPath,
    message:
      `🔄 Skill "${name}" refeita com sucesso. Versão anterior salva em ${path.basename(backupPath)}. ` +
      `Pode usar a nova versão agora!`,
  }
}
