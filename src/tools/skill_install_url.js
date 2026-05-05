/**
 * skill_install_url.js — Instala uma skill baixando código de uma URL.
 *
 * Aceita:
 *   - URL direta pra arquivo .js
 *   - GitHub Gist (raw)
 *   - GitHub blob (converte pra raw)
 *   - Pastebin raw
 *
 * Pipeline:
 *   1. Fetch código
 *   2. Valida sintaxe + estrutura (export definition + execute)
 *   3. Bloqueia padrões perigosos (eval, process.exit, etc)
 *   4. Salva em src/tools/user-tools/
 *   5. Hot-load no registry
 *
 * Pra MARKETPLACE futuro: o user pode subir gists públicos com skills boas e
 * compartilhar URLs. Não precisa de servidor central.
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

let _registry = null
export function setRegistry(reg) { _registry = reg }

export const definition = {
  name: 'skill_install_url',
  description: 'Instala uma skill baixando código de uma URL (GitHub Gist, raw .js, etc). Use quando user disser "instala a skill de URL X", "baixa essa skill" + URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL pro arquivo .js (raw GitHub, Gist raw, etc)' },
      name: { type: 'string', description: 'Nome opcional pra salvar (auto se omitido)' },
    },
    required: ['url'],
  },
}

function normalizeUrl(raw) {
  // Converte URL "blob" do GitHub pra raw
  // https://github.com/user/repo/blob/main/file.js
  // → https://raw.githubusercontent.com/user/repo/main/file.js
  const githubBlob = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i
  const m = raw.match(githubBlob)
  if (m) {
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`
  }
  // Gist URL → /raw at the end
  if (/^https?:\/\/gist\.github\.com\//.test(raw) && !/\/raw/.test(raw)) {
    return raw.replace(/\/?$/, '/raw')
  }
  return raw
}

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Muitos redirects'))
    const lib = url.startsWith('https://') ? https : http
    lib.get(url, {
      headers: { 'User-Agent': 'Kerneo-Lite-SkillInstaller', Accept: 'text/plain, application/javascript, */*' },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return fetchText(res.headers.location, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`))
      }
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function validateSkillCode(code) {
  if (!code.includes('export const definition')) {
    return { valid: false, reason: 'Sem export `definition`' }
  }
  if (!code.includes('export async function execute') && !code.includes('export function execute')) {
    return { valid: false, reason: 'Sem export `execute`' }
  }
  // Bloqueia padrões perigosos
  const blocked = [
    { re: /process\.exit\s*\(/, why: 'process.exit() proibido' },
    { re: /eval\s*\(/, why: 'eval() proibido' },
    { re: /new\s+Function\s*\(/, why: 'new Function() proibido' },
    { re: /child_process[^"']*['"][^"']*['"]\s*\)\s*\.[^(]*\(['"](rm\s+-rf|del\s+\/[fs]|format\s+[a-z]:)/i, why: 'comando destrutivo' },
    { re: /\bnpm\s+install\b/, why: 'npm install proibido em skills' },
    { re: /\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/.*\.\.\//, why: 'path traversal suspeito' },
  ]
  for (const b of blocked) {
    if (b.re.test(code)) return { valid: false, reason: b.why }
  }
  return { valid: true }
}

function extractName(code) {
  const m = code.match(/name:\s*['"]([a-z][a-z0-9_]{1,49})['"]/)
  return m ? m[1] : null
}

export async function execute({ url, name } = {}) {
  if (!_registry) return { ok: false, error: 'Registry não disponível' }
  if (!url) return { ok: false, error: 'url obrigatório' }

  // Normaliza URL
  const normalizedUrl = normalizeUrl(url)

  // Fetch
  let code
  try {
    code = await fetchText(normalizedUrl)
  } catch (err) {
    return { ok: false, error: `Falha ao baixar: ${err.message}` }
  }

  if (!code || code.length < 100) {
    return { ok: false, error: 'Conteúdo baixado muito curto / vazio' }
  }

  // Valida
  const validation = validateSkillCode(code)
  if (!validation.valid) {
    return {
      ok: false,
      error: `Código rejeitado: ${validation.reason}`,
      hint: 'Esse arquivo não parece ser uma skill Kerneo válida ou tem padrões perigosos.',
    }
  }

  // Detecta nome (do código ou param)
  const finalName = name || extractName(code)
  if (!finalName) {
    return { ok: false, error: 'Não consegui detectar o nome da skill. Passe o param `name`.' }
  }

  // Conflito?
  if (_registry.get(finalName)) {
    return {
      ok: false,
      error: `Já existe skill "${finalName}". Remova primeiro com skill_remove ou troque o nome.`,
    }
  }

  // Garante o nome no código (caso user passou name diferente do code)
  const codeWithName = code.replace(/name:\s*['"][a-z][a-z0-9_]*['"]/, `name: '${finalName}'`)

  // Salva
  const userDir = _registry.getUserToolsDir()
  const filePath = path.join(userDir, `${finalName}.js`)
  try {
    fs.writeFileSync(filePath, codeWithName, 'utf-8')
  } catch (err) {
    return { ok: false, error: `Falha ao salvar: ${err.message}` }
  }

  // Hot-load
  const loadedName = await _registry.loadOne(filePath)
  if (!loadedName) {
    try { fs.unlinkSync(filePath) } catch {}
    return { ok: false, error: 'Código baixado tem erro de sintaxe. Não foi carregado.' }
  }

  return {
    ok: true,
    name: loadedName,
    file_path: filePath,
    source_url: url,
    message: `✨ Skill "${loadedName}" instalada de ${url}. Pode usar agora!`,
  }
}
