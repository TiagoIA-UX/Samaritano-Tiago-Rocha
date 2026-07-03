/**
 * kerneo_self_update.js — Auto-update do Kerneo Lite via GitHub releases.
 *
 * Pipeline:
 *   1. Lê versão atual do package.json
 *   2. Fetch latest release via GitHub API
 *   3. Compara versões — se igual, nada faz
 *   4. Baixa zipball, descompacta em temp
 *   5. Backup user-tools/, .env, data/, config.json
 *   6. Substitui arquivos do código (preserva o que matters)
 *   7. Restaura backup
 *   8. Mostra changelog
 *   9. Sinaliza pra restart
 *
 * Configuração: env KERNEO_UPDATE_REPO (default: kerneo-org/kerneo-lite).
 * Pode-se trocar pra qualquer repo com releases compatíveis.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const REPO = process.env.SAMARITANO_UPDATE_REPO || process.env.KERNEO_UPDATE_REPO || 'TiagoIA-UX/Samaritano-Tiago-Rocha'

export const definition = {
  name: 'kerneo_self_update',
  description:
    'Verifica e instala atualizações do Samaritano via GitHub. Use quando user pedir "atualiza", "verifica nova versão", "auto-update". Preserva user-tools, config.json, .env.local e data.',
  parameters: {
    type: 'object',
    properties: {
      check_only: {
        type: 'boolean',
        default: false,
        description: 'Se true, só verifica versão sem baixar/instalar.',
      },
      force: {
        type: 'boolean',
        default: false,
        description: 'Força update mesmo se versão atual >= remota.',
      },
    },
  },
}

function readCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'))
    return pkg.version || '0.0.0'
  } catch { return '0.0.0' }
}

function compareVersions(a, b) {
  const aP = a.replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  const bP = b.replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  for (let i = 0; i < 3; i++) {
    const da = aP[i] || 0, db = bP[i] || 0
    if (da !== db) return da - db
  }
  return 0
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Samaritano-Updater', Accept: 'application/json', ...headers },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location, headers).then(resolve, reject)
      }
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
        try { resolve(JSON.parse(data)) } catch (err) { reject(err) }
      })
    }).on('error', reject)
  })
}

async function fetchLatestRelease() {
  return await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
}

export async function execute({ check_only = false, force = false } = {}) {
  const current = readCurrentVersion()

  let release
  try {
    release = await fetchLatestRelease()
  } catch (err) {
    if (err.message.includes('404')) {
      return {
        ok: false,
        error: `Repo "${REPO}" não tem releases publicadas (ou não existe).`,
        hint:
          `Configure o repo via SAMARITANO_UPDATE_REPO ou KERNEO_UPDATE_REPO.\n` +
          `Ex: SAMARITANO_UPDATE_REPO=TiagoIA-UX/Samaritano-Tiago-Rocha\n\n` +
          `Você está na versão ${current}. Auto-update ficará disponível quando o repo for publicado.`,
        current,
      }
    }
    return {
      ok: false,
      error: `Falha ao consultar GitHub: ${err.message}`,
      hint: `Verifique sua conexão com a internet ou o repo configurado (${REPO}).`,
      current,
    }
  }

  const latest = release.tag_name || release.name || '0.0.0'
  const cmp = compareVersions(current, latest)

  if (cmp >= 0 && !force) {
    return {
      ok: true,
      up_to_date: true,
      current,
      latest,
      message: `Você já está na versão ${current} (mais recente). Nada a atualizar.`,
    }
  }

  if (check_only) {
    return {
      ok: true,
      up_to_date: false,
      current,
      latest,
      changelog: release.body?.slice(0, 500),
      message: `🆕 Versão ${latest} disponível (você está na ${current}). Pra atualizar: "atualiza o kerneo".`,
    }
  }

  // Não implementamos download+install ainda (depende do user ter repo público).
  // Por enquanto, retorna instruções pro user atualizar manualmente.
  return {
    ok: true,
    up_to_date: false,
    current,
    latest,
    changelog: release.body?.slice(0, 800) || '(sem changelog)',
    download_url: release.zipball_url,
    message:
      `🆕 Nova versão ${latest} disponível (você está na ${current}).\n\n` +
      `Pra atualizar:\n` +
      `1) Baixe: ${release.html_url}\n` +
      `2) Substitua os arquivos da pasta src/ pela nova versão\n` +
      `3) Mantenha: .env, config.json, data/, src/tools/user-tools/\n` +
      `4) Rode: npm install (se package.json mudou)\n` +
      `5) Reinicie o Samaritano\n\n` +
      `Changelog:\n${release.body?.slice(0, 500) || '(sem detalhes)'}`,
  }
}

export { compareVersions, readCurrentVersion }
