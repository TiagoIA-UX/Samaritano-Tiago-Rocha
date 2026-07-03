/**
 * skill_share.js — Exporta uma skill criada pelo user pra compartilhar.
 *
 * Modos:
 *   - clipboard: copia código pro clipboard (futuro)
 *   - file: salva em data/exports/
 *   - text: retorna o código direto na resposta (user copia manual)
 *   - gist: cria GitHub Gist público (futuro, requer GH_TOKEN)
 */

import fs from 'fs'
import path from 'path'

let _registry = null
export function setRegistry(reg) { _registry = reg }

export const definition = {
  name: 'skill_share',
  description: 'Exporta uma skill criada pelo user pra compartilhar com outras pessoas. Retorna o código JS pronto pra colar em outro Samaritano. Use quando user pedir "compartilha skill X", "exporta skill Y", "como mando essa skill pra alguém".',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome da skill a exportar' },
      mode: {
        type: 'string',
        enum: ['text', 'file'],
        default: 'text',
        description: 'text=retorna código na resposta. file=salva em data/exports/.',
      },
    },
    required: ['name'],
  },
}

export async function execute({ name, mode = 'text' } = {}) {
  if (!_registry) return { ok: false, error: 'Registry não disponível' }
  if (!name) return { ok: false, error: 'name obrigatório' }

  const entry = _registry.get(name)
  if (!entry) return { ok: false, error: `Skill "${name}" não existe.` }

  // Só skills user-created podem ser exportadas (nativas são do projeto)
  const isUserCreated = entry.filePath?.includes('user-tools')
  if (!isUserCreated) {
    return {
      ok: false,
      error: `"${name}" é uma skill nativa do Samaritano, não criada por você. Não há nada pra exportar.`,
    }
  }

  let code
  try {
    code = fs.readFileSync(entry.filePath, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Falha ao ler arquivo: ${err.message}` }
  }

  const meta = {
    name,
    description: entry.definition.description,
    parameters: entry.definition.parameters,
    exported_at: new Date().toISOString(),
    kerneo_version: '0.3.0',
  }

  if (mode === 'file') {
    const exportsDir = path.join(process.cwd(), 'data', 'exports')
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true })
    const codeFile = path.join(exportsDir, `${name}.js`)
    const metaFile = path.join(exportsDir, `${name}.json`)
    try {
      fs.writeFileSync(codeFile, code, 'utf-8')
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
    } catch (err) {
      return { ok: false, error: `Falha ao salvar: ${err.message}` }
    }
    return {
      ok: true,
      mode,
      name,
      files: [codeFile, metaFile],
      message:
        `Skill "${name}" exportada:\n` +
        `  • Código: ${codeFile}\n` +
        `  • Meta:   ${metaFile}\n` +
        `Mande esses 2 arquivos pra quem quiser instalar.`,
    }
  }

  // mode === 'text'
  return {
    ok: true,
    mode,
    name,
    description: entry.definition.description,
    code,
    instructions:
      'Pra outra pessoa instalar: ela cola o código abaixo num arquivo `' + name + '.js` ' +
      'dentro de `src/tools/user-tools/` do Samaritano dela e reinicia. Ou usa skill_install_url se for um link.',
    message:
      `=== Skill: ${name} ===\n` +
      `${entry.definition.description}\n\n` +
      `--- COPIE O CÓDIGO ABAIXO ---\n\n${code}\n\n` +
      `--- FIM ---\n\n` +
      `Instalar: cole em src/tools/user-tools/${name}.js do outro Samaritano.`,
  }
}
