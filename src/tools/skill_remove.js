/**
 * skill_remove.js — Remove uma skill criada pelo user.
 *
 * Só permite remover tools em src/tools/user-tools/ (isUserCreated=true).
 * Tools nativas são protegidas.
 */

let _registry = null
export function setRegistry(reg) { _registry = reg }

export const definition = {
  name: 'skill_remove',
  description: 'Remove uma skill criada pelo user (deleta o arquivo .js E remove do registry). NÃO permite remover skills nativas. Use quando user pedir "remove a skill X", "deleta a tool Y", "apaga a skill Z".',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome exato da skill a remover.' },
    },
    required: ['name'],
  },
}

export async function execute({ name } = {}) {
  if (!_registry) return { ok: false, error: 'Registry não disponível' }
  if (!name) return { ok: false, error: 'name obrigatório' }

  const entry = _registry.get(name)
  if (!entry) {
    return { ok: false, error: `Skill "${name}" não existe.` }
  }

  // Só permite remover tools em user-tools/
  const isUserCreated = entry.filePath?.includes('user-tools')
  if (!isUserCreated) {
    return {
      ok: false,
      error: `"${name}" é uma skill nativa (protegida). Só removo skills criadas dinamicamente.`,
    }
  }

  const removed = await _registry.remove(name)
  if (!removed) {
    return { ok: false, error: `Falha ao remover "${name}".` }
  }

  return {
    ok: true,
    name,
    message: `Removi a skill "${name}". Arquivo deletado.`,
  }
}
