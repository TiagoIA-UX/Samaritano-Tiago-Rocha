/**
 * skill_list.js — Lista todas as skills/tools (nativas + criadas pelo user).
 *
 * Use quando user perguntar:
 *   - "quais skills você tem?"
 *   - "lista as tools"
 *   - "o que você sabe fazer?"
 */

let _registry = null
export function setRegistry(reg) { _registry = reg }

export const definition = {
  name: 'skill_list',
  description: 'Lista todas as skills/tools disponíveis (nativas + criadas pelo user). Use quando user perguntar "quais skills você tem", "o que sabe fazer", "lista tools".',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['all', 'native', 'user_created'],
        default: 'all',
        description: 'Filtra por tipo. all=todas, native=só nativas, user_created=só as criadas dinamicamente',
      },
    },
  },
}

export async function execute({ filter = 'all' } = {}) {
  if (!_registry) return { ok: false, error: 'Registry não disponível' }

  const all = _registry.listFull ? _registry.listFull() : _registry.list()
  let filtered = all
  if (filter === 'native') {
    filtered = all.filter(t => !t.isUserCreated)
  } else if (filter === 'user_created') {
    filtered = all.filter(t => t.isUserCreated)
  }

  const summary = filtered.map(t => ({
    name: t.name,
    description: (t.description || '').slice(0, 200),
    user_created: !!t.isUserCreated,
  }))

  const userCount = all.filter(t => t.isUserCreated).length
  const nativeCount = all.length - userCount

  return {
    ok: true,
    total: all.length,
    native_count: nativeCount,
    user_created_count: userCount,
    skills: summary,
    message:
      `Tenho ${all.length} skills total: ${nativeCount} nativas + ${userCount} criadas por você.\n` +
      summary.map(s => `  • ${s.name}${s.user_created ? ' ✨' : ''} — ${s.description.slice(0, 80)}`).join('\n'),
  }
}
