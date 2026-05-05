/**
 * browser_open.js — Abre URL no navegador padrão do user.
 *
 * Usa o browser default do sistema (sem forçar Chrome/Edge) — quem registra
 * default é o user. Pra forçar Chrome+profile específico, edite ou veja
 * a versão "full" deste tool.
 */

import { spawn } from 'child_process'

const SITE_MAP = {
  ifood: 'https://www.ifood.com.br',
  gmail: 'https://mail.google.com',
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  spotify: 'https://open.spotify.com',
  amazon: 'https://www.amazon.com.br',
  netflix: 'https://www.netflix.com',
  github: 'https://github.com',
  drive: 'https://drive.google.com',
  whatsapp: 'https://web.whatsapp.com',
  notion: 'https://www.notion.so',
  linkedin: 'https://www.linkedin.com',
  twitter: 'https://twitter.com',
  x: 'https://x.com',
  instagram: 'https://www.instagram.com',
  facebook: 'https://www.facebook.com',
  reddit: 'https://www.reddit.com',
  wikipedia: 'https://pt.wikipedia.org',
  maps: 'https://www.google.com/maps',
  outlook: 'https://outlook.live.com',
}

export const definition = {
  name: 'browser_open',
  description: 'Abre URL no navegador padrão. Aceita nome de site comum (ifood, gmail, youtube, github, netflix, etc) OU URL completa. Use quando o user pedir "abre X", "navega até Y", "vai pra Z".',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL completa OU nome de site (ifood, gmail, youtube, github, etc)',
      },
    },
    required: ['url'],
  },
}

function normalizeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const lc = raw.trim().toLowerCase()
  if (SITE_MAP[lc]) return SITE_MAP[lc]
  // strip articles
  const cleaned = lc.replace(/^(o|a|do|da|no|na|um|uma)\s+/, '')
  if (SITE_MAP[cleaned]) return SITE_MAP[cleaned]
  // assume URL
  let url = raw.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export async function execute(args = {}) {
  const url = normalizeUrl(args.url)
  if (!url) return { ok: false, error: `URL inválida: ${args.url}` }

  const platform = process.platform
  let cmd, cmdArgs
  if (platform === 'win32') { cmd = 'cmd'; cmdArgs = ['/c', 'start', '""', url] }
  else if (platform === 'darwin') { cmd = 'open'; cmdArgs = [url] }
  else { cmd = 'xdg-open'; cmdArgs = [url] }

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' })
      child.on('error', (err) => resolve({ ok: false, error: `Spawn falhou: ${err.message}` }))
      if (child.unref) child.unref()
      resolve({ ok: true, url, message: `Abri ${url} no seu navegador.` })
    } catch (err) {
      resolve({ ok: false, error: err.message })
    }
  })
}
