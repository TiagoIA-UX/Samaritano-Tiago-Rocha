/**
 * file_io.js — Read/write arquivos no sandbox.
 *
 * Sandbox restrito a `data/` e `workspace/` por segurança. NÃO permite
 * acesso fora desses paths (anti-path-traversal).
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const ALLOWED_ROOTS = [
  path.join(process.cwd(), 'data'),
  path.join(process.cwd(), 'workspace'),
  path.join(os.tmpdir(), 'kerneo'),
].map(p => path.resolve(p))

function validatePath(p) {
  const abs = path.resolve(p)
  const allowed = ALLOWED_ROOTS.some(root => abs === root || abs.startsWith(root + path.sep))
  if (!allowed) {
    throw new Error(`Path "${abs}" fora do sandbox. Permitidos: ${ALLOWED_ROOTS.join(' | ')}`)
  }
  return abs
}

const ACTION_ALIASES = {
  save: 'write', store: 'write', create: 'write', put: 'write',
  get: 'read', cat: 'read', open: 'read',
  ls: 'list', dir: 'list', show: 'list',
  has: 'exists', check: 'exists',
}

export const definition = {
  name: 'file_io',
  description: 'Read/write arquivos no sandbox (data/, workspace/, tmp/kerneo). Use pra salvar outputs, ler arquivos locais.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'list', 'exists'] },
      path: { type: 'string', description: 'Caminho absoluto dentro do sandbox' },
      content: { type: 'string', description: 'Conteúdo (só pra action=write)' },
    },
    required: ['action', 'path'],
  },
}

export async function execute(args = {}) {
  const action = ACTION_ALIASES[String(args.action || '').toLowerCase()] || args.action
  const filePath = args.path
  if (!filePath) return { ok: false, error: 'path obrigatório' }

  let absPath
  try { absPath = validatePath(filePath) } catch (err) { return { ok: false, error: err.message } }

  switch (action) {
    case 'read': {
      try {
        const data = await fs.readFile(absPath, 'utf-8')
        return { ok: true, path: absPath, content: data, size: data.length }
      } catch (err) { return { ok: false, error: err.message } }
    }
    case 'write': {
      try {
        await fs.mkdir(path.dirname(absPath), { recursive: true })
        await fs.writeFile(absPath, args.content || '', 'utf-8')
        return { ok: true, path: absPath, written: (args.content || '').length }
      } catch (err) { return { ok: false, error: err.message } }
    }
    case 'list': {
      try {
        const entries = await fs.readdir(absPath, { withFileTypes: true })
        return {
          ok: true,
          path: absPath,
          entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
        }
      } catch (err) { return { ok: false, error: err.message } }
    }
    case 'exists': {
      try {
        const stat = await fs.stat(absPath)
        return { ok: true, exists: true, type: stat.isDirectory() ? 'dir' : 'file', size: stat.size }
      } catch { return { ok: true, exists: false } }
    }
    default:
      return { ok: false, error: `action desconhecida: ${args.action}`, valid: ['read', 'write', 'list', 'exists'] }
  }
}
