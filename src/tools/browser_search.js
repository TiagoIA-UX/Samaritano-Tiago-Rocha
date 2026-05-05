/**
 * browser_search.js — Abre site direto na URL de busca, com termo pré-preenchido.
 *
 * User VÊ os resultados em tempo real no próprio Chrome (com sua sessão).
 * Sem screenshot, sem vision LLM, sem interpretação — máxima velocidade.
 */

import { spawn } from 'child_process'

const SEARCH_PATTERNS = {
  // Web/Dev
  google:       (q) => `https://www.google.com/search?q=${q}`,
  bing:         (q) => `https://www.bing.com/search?q=${q}`,
  duckduckgo:   (q) => `https://duckduckgo.com/?q=${q}`,
  github:       (q) => `https://github.com/search?q=${q}`,
  stackoverflow:(q) => `https://stackoverflow.com/search?q=${q}`,
  npm:          (q) => `https://www.npmjs.com/search?q=${q}`,
  wikipedia:    (q) => `https://pt.wikipedia.org/w/index.php?search=${q}`,

  // E-commerce
  amazon:       (q) => `https://www.amazon.com.br/s?k=${q}`,
  mercadolivre: (q) => `https://lista.mercadolivre.com.br/${q}`,
  'mercado livre': (q) => `https://lista.mercadolivre.com.br/${q}`,
  shopee:       (q) => `https://shopee.com.br/search?keyword=${q}`,
  magalu:       (q) => `https://www.magazineluiza.com.br/busca/${q}`,

  // Mídia / Streaming
  youtube:      (q) => `https://www.youtube.com/results?search_query=${q}`,
  spotify:      (q) => `https://open.spotify.com/search/${q}`,
  netflix:      (q) => `https://www.netflix.com/search?q=${q}`,

  // Maps
  maps:         (q) => `https://www.google.com/maps/search/${q}`,
  mapas:        (q) => `https://www.google.com/maps/search/${q}`,

  // Sites SPA com bot detection (fallback Google site:)
  ifood:        (q) => `https://www.google.com/search?q=site%3Aifood.com.br+${q}`,
  rappi:        (q) => `https://www.google.com/search?q=site%3Arappi.com.br+${q}`,
}

export const definition = {
  name: 'browser_search',
  description: 'Abre o Chrome direto na URL de busca de um site (google, youtube, github, amazon, mercado livre, mapas, etc). User vê resultados em tempo real. Use pra "pesquisa X no Y", "busca X no Y".',
  parameters: {
    type: 'object',
    properties: {
      site: {
        type: 'string',
        description: `Nome do site. Suportados: ${Object.keys(SEARCH_PATTERNS).join(', ')}.`,
      },
      query: {
        type: 'string',
        description: 'Termo de busca livre.',
      },
    },
    required: ['site', 'query'],
  },
}

function resolveSite(raw) {
  if (!raw) return null
  const lc = String(raw).trim().toLowerCase()
  const cleaned = lc.replace(/^(o|a|do|da|no|na|em|num|numa)\s+/, '')
  if (SEARCH_PATTERNS[cleaned]) return cleaned
  if (SEARCH_PATTERNS[lc]) return lc
  for (const k of Object.keys(SEARCH_PATTERNS)) {
    if (cleaned.includes(k) || k.includes(cleaned)) return k
  }
  return null
}

export async function execute(args = {}) {
  const site = resolveSite(args.site)
  const query = String(args.query || '').trim()
  if (!site) return { ok: false, error: `Site "${args.site}" não suportado.`, supported: Object.keys(SEARCH_PATTERNS) }
  if (!query) return { ok: false, error: 'query obrigatória' }

  const url = SEARCH_PATTERNS[site](encodeURIComponent(query))

  const platform = process.platform
  let cmd, cmdArgs
  if (platform === 'win32') { cmd = 'cmd'; cmdArgs = ['/c', 'start', '""', url] }
  else if (platform === 'darwin') { cmd = 'open'; cmdArgs = [url] }
  else { cmd = 'xdg-open'; cmdArgs = [url] }

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' })
      child.on('error', (err) => resolve({ ok: false, error: err.message }))
      if (child.unref) child.unref()
      const niceSite = site.charAt(0).toUpperCase() + site.slice(1)
      resolve({
        ok: true,
        site, query, url,
        message: `Pesquisando "${query}" no ${niceSite}. Veja na tela em tempo real.`,
      })
    } catch (err) {
      resolve({ ok: false, error: err.message })
    }
  })
}
