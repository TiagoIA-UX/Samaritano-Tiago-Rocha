/**
 * web_search.js — Pesquisa web real (resultados estruturados, não só URL).
 *
 * Estratégia minimal-keys (mesma OPENAI_API_KEY):
 *   1. OpenAI gpt-4o-search-preview (built-in web search) — preferred
 *   2. DuckDuckGo HTML scraping — zero key fallback honesto
 *
 * Use quando user pede info factual ("preço atual de X", "quem é Y", "como fazer Z").
 * Pra navegação visual, prefira browser_search.
 */

import { webSearch as openaiSearch } from '../llm/openai.js'

export const definition = {
  name: 'web_search',
  description: 'Pesquisa web e retorna resposta sintetizada com citações. Use pra fatos atuais (preços, notícias, definições). Pra ABRIR um site com busca pré-preenchida, use browser_search.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Pergunta ou termo de busca.' },
      max_results: { type: 'number', default: 5 },
    },
    required: ['query'],
  },
}

export async function execute({ query, max_results = 5 }) {
  // Tier 1: OpenAI search (mesma key, built-in)
  if (process.env.OPENAI_API_KEY && process.env.WEB_SEARCH_DISABLE_OPENAI !== '1') {
    const r = await openaiSearch(query, { max_tokens: 800 })
    if (r.ok) {
      return {
        ok: true,
        provider: 'openai_search',
        query,
        answer: r.content,
        results: r.citations.slice(0, max_results),
      }
    }
  }
  // Tier 2: DuckDuckGo HTML
  return await searchDuckDuckGoHTML(query, max_results)
}

async function searchDuckDuckGoHTML(query, max_results) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let res
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    return { ok: false, provider: 'duckduckgo_html', query, results: [], error: err.message }
  }
  clearTimeout(timer)
  if (!res.ok) return { ok: false, provider: 'duckduckgo_html', query, results: [], error: `HTTP ${res.status}` }

  const html = await res.text()
  const results = []
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html)) !== null && results.length < max_results) {
    let urlRaw = m[1]
    if (urlRaw.startsWith('//duckduckgo.com/l/?') || urlRaw.startsWith('/l/?')) {
      const ud = urlRaw.match(/uddg=([^&]+)/)
      if (ud) urlRaw = decodeURIComponent(ud[1])
    }
    if (urlRaw.startsWith('//')) urlRaw = 'https:' + urlRaw
    const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    results.push({ title: clean(m[2]), url: urlRaw, snippet: clean(m[3]) })
  }

  return {
    ok: true,
    provider: 'duckduckgo_html',
    query,
    results,
    answer: results.length > 0
      ? `${results.length} resultados encontrados. Top 3: ${results.slice(0, 3).map(r => r.title).join(' · ')}`
      : 'Nenhum resultado.',
  }
}
