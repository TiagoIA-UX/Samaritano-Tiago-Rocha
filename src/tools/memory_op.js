/**
 * memory_op.js — Salvar/buscar fatos sobre o user (cep, preferências, notas).
 *
 * Tolerante a aliases LLM-friendly:
 *   action: save|store|remember|set → save_fact
 *   action: get|retrieve|recall → get_fact
 *   action: find|query|lookup → search
 */

let _store = null
export function setStore(s) { _store = s }

const ACTION_ALIASES = {
  save: 'save_fact', store: 'save_fact', remember: 'save_fact', set: 'save_fact', write: 'save_fact',
  get: 'get_fact', retrieve: 'get_fact', recall: 'get_fact', read: 'get_fact', fetch: 'get_fact',
  list: 'list_facts', all: 'list_facts',
  find: 'search', query: 'search', lookup: 'search',
}

export const definition = {
  name: 'memory_op',
  description: 'Salva ou busca fatos sobre o usuário (CEP, nome, preferências, notas). Persistente entre sessões.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['save_fact', 'get_fact', 'search', 'list_facts'] },
      key: { type: 'string', description: 'Chave (pra save_fact e get_fact)' },
      value: { type: 'string', description: 'Valor (pra save_fact)' },
      query: { type: 'string', description: 'Termo de busca (pra search)' },
      category: { type: 'string', description: 'Categoria opcional (preference, fact, etc)' },
    },
    required: ['action'],
  },
}

function normalizeArgs(raw = {}) {
  const a = raw || {}
  const action = a.action || a.operation || a.op || a.command
  const query = a.query || a.q || a.search || a.find
  const key = a.key || a.fact_key || a.id || a.name
  let value = a.value ?? a.fact ?? a.content ?? a.data ?? a.text
  if (value && typeof value === 'object') value = JSON.stringify(value)
  // Auto-derive key from value se faltou
  let derivedKey = key
  if (!derivedKey && value) {
    const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)
    derivedKey = slug || `note_${Date.now().toString(36)}`
  }
  return {
    action,
    query,
    key: derivedKey,
    value,
    category: a.category || a.tag || (Array.isArray(a.tags) ? a.tags[0] : null),
  }
}

export async function execute(rawArgs) {
  if (!_store) return { ok: false, error: 'Memory store não inicializada' }
  const { action, query, key, value, category } = normalizeArgs(rawArgs)
  const norm = ACTION_ALIASES[String(action || '').toLowerCase()] || action

  switch (norm) {
    case 'save_fact':
      if (!value) return { ok: false, error: 'value obrigatório', hint: '{ action:"save_fact", key:"...", value:"..." }' }
      const finalKey = key || `note_${Date.now().toString(36)}`
      _store.saveFact(finalKey, value, { category })
      return { ok: true, key: finalKey, value, action: 'save_fact' }

    case 'get_fact':
      if (!key) return { ok: false, error: 'key obrigatório' }
      return { ok: true, fact: _store.getFact(key) }

    case 'search':
      if (!query) return { ok: true, results: _store.listFacts(20), note: 'sem query — listou recentes' }
      return { ok: true, results: _store.searchFacts(query, 10) }

    case 'list_facts':
      return { ok: true, facts: _store.listFacts(50) }

    default:
      return {
        ok: false,
        error: `action desconhecida: ${action}`,
        valid_actions: ['save_fact', 'get_fact', 'search', 'list_facts'],
        aliases: Object.keys(ACTION_ALIASES),
      }
  }
}
