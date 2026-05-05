/**
 * system_app_open.js — Abre apps NATIVOS do sistema operacional.
 *
 * Diferente de browser_open (URL web): esse tool abre programas instalados
 * no PC: calculadora, bloco de notas, paint, VSCode, Spotify, etc.
 *
 * Cross-platform com mapeamento por OS. Se app não está no registry,
 * tenta resolver por nome direto via spawn.
 *
 * IMPORTANTE: o orchestrator usa esse tool quando user diz "abre [APP]"
 * com nome de programa. Pra "abre [SITE]" usa browser_open.
 */

import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { makeLogger } from '../utils/logger.js'

const log = makeLogger('app_open')
const execAsync = promisify(exec)

// Registry de apps comuns por OS — chaves em PT e EN
const APP_REGISTRY = {
  win32: {
    // Apps nativos Windows (sempre presentes)
    'calculadora':            { cmd: 'calc.exe', alias: ['calc', 'calculator'] },
    'bloco de notas':         { cmd: 'notepad.exe', alias: ['notepad', 'bloco'] },
    'paint':                  { cmd: 'mspaint.exe', alias: ['ms paint'] },
    'wordpad':                { cmd: 'wordpad.exe' },
    'cmd':                    { cmd: 'cmd.exe', alias: ['prompt', 'prompt de comando', 'terminal'] },
    'powershell':             { cmd: 'powershell.exe' },
    'gerenciador de tarefas': { cmd: 'taskmgr.exe', alias: ['task manager', 'taskmgr'] },
    'painel de controle':     { cmd: 'control.exe', alias: ['control panel', 'control'] },
    'configurações':          { cmd: 'ms-settings:', shell: true, alias: ['configuracoes', 'settings', 'ajustes'] },
    'explorer':               { cmd: 'explorer.exe', alias: ['explorador', 'explorador de arquivos', 'arquivos', 'files'] },
    'gravador de voz':        { cmd: 'soundrecorder.exe', alias: ['voice recorder'] },
    'lupa':                   { cmd: 'magnify.exe', alias: ['magnifier'] },
    'teclado virtual':        { cmd: 'osk.exe', alias: ['osk', 'on-screen keyboard'] },
    'monitor de recursos':    { cmd: 'resmon.exe', alias: ['resource monitor', 'resmon'] },
    'editor de registro':     { cmd: 'regedit.exe', alias: ['regedit', 'registry editor'] },
    'mapa de caracteres':     { cmd: 'charmap.exe', alias: ['character map'] },
    'limpeza de disco':       { cmd: 'cleanmgr.exe', alias: ['disk cleanup'] },
    'desfragmentador':        { cmd: 'dfrgui.exe', alias: ['defrag'] },

    // Apps populares (precisam estar instalados — fallback browser se não)
    'spotify':                { cmd: 'spotify.exe', fallback_url: 'https://open.spotify.com' },
    'discord':                { cmd: 'discord.exe', alias: ['discord'], fallback_url: 'https://discord.com/app' },
    'whatsapp':               { cmd: 'WhatsApp.exe', fallback_url: 'https://web.whatsapp.com' },
    'telegram':               { cmd: 'telegram.exe', fallback_url: 'https://web.telegram.org' },
    'visual studio code':     { cmd: 'code.cmd', alias: ['vscode', 'vs code', 'code'] },
    'visual studio':          { cmd: 'devenv.exe' },
    'chrome':                 { cmd: 'chrome.exe' },
    'edge':                   { cmd: 'msedge.exe', alias: ['microsoft edge'] },
    'firefox':                { cmd: 'firefox.exe' },
    'steam':                  { cmd: 'steam.exe' },
    'obs':                    { cmd: 'obs64.exe', alias: ['obs studio'] },
    'photoshop':              { cmd: 'Photoshop.exe' },
    'premiere':               { cmd: 'Adobe Premiere Pro.exe' },
    'word':                   { cmd: 'WINWORD.EXE', alias: ['microsoft word'] },
    'excel':                  { cmd: 'EXCEL.EXE', alias: ['microsoft excel'] },
    'powerpoint':             { cmd: 'POWERPNT.EXE', alias: ['microsoft powerpoint'] },
    'outlook':                { cmd: 'OUTLOOK.EXE', alias: ['microsoft outlook'], fallback_url: 'https://outlook.live.com' },
    'teams':                  { cmd: 'Teams.exe', alias: ['microsoft teams'], fallback_url: 'https://teams.microsoft.com' },
  },

  darwin: {
    'calculadora':            { cmd: 'open', args: ['-a', 'Calculator'], alias: ['calculator', 'calc'] },
    'bloco de notas':         { cmd: 'open', args: ['-a', 'TextEdit'], alias: ['textedit', 'notepad'] },
    'finder':                 { cmd: 'open', args: ['-a', 'Finder'], alias: ['explorer', 'arquivos'] },
    'safari':                 { cmd: 'open', args: ['-a', 'Safari'] },
    'chrome':                 { cmd: 'open', args: ['-a', 'Google Chrome'] },
    'firefox':                { cmd: 'open', args: ['-a', 'Firefox'] },
    'spotify':                { cmd: 'open', args: ['-a', 'Spotify'], fallback_url: 'https://open.spotify.com' },
    'discord':                { cmd: 'open', args: ['-a', 'Discord'], fallback_url: 'https://discord.com/app' },
    'whatsapp':               { cmd: 'open', args: ['-a', 'WhatsApp'], fallback_url: 'https://web.whatsapp.com' },
    'visual studio code':     { cmd: 'open', args: ['-a', 'Visual Studio Code'], alias: ['vscode', 'vs code', 'code'] },
    'terminal':               { cmd: 'open', args: ['-a', 'Terminal'] },
    'configurações':          { cmd: 'open', args: ['-a', 'System Settings'], alias: ['settings', 'configuracoes', 'preferences'] },
    'app store':              { cmd: 'open', args: ['-a', 'App Store'] },
    'mensagens':              { cmd: 'open', args: ['-a', 'Messages'], alias: ['messages'] },
    'mail':                   { cmd: 'open', args: ['-a', 'Mail'] },
  },

  linux: {
    'calculadora':            { cmd: 'gnome-calculator', alias: ['calculator', 'calc', 'kcalc'] },
    'bloco de notas':         { cmd: 'gedit', alias: ['gedit', 'notepad', 'text editor'] },
    'arquivos':               { cmd: 'nautilus', alias: ['files', 'file manager', 'explorer'] },
    'terminal':               { cmd: 'gnome-terminal', alias: ['terminal'] },
    'firefox':                { cmd: 'firefox' },
    'chrome':                 { cmd: 'google-chrome' },
    'chromium':               { cmd: 'chromium' },
    'spotify':                { cmd: 'spotify', fallback_url: 'https://open.spotify.com' },
    'discord':                { cmd: 'discord', fallback_url: 'https://discord.com/app' },
    'visual studio code':     { cmd: 'code', alias: ['vscode', 'vs code'] },
    'configurações':          { cmd: 'gnome-control-center', alias: ['settings'] },
  },
}

export const definition = {
  name: 'system_app_open',
  description:
    'Abre um aplicativo NATIVO instalado no sistema operacional do user (calculadora, bloco de notas, paint, VSCode, Spotify, Discord, etc). USE quando o user disser "abre [PROGRAMA]" referindo-se a um app desktop. Para SITES web, use browser_open. Em caso de dúvida entre app e site (ex: "spotify"), prefira system_app_open — se app não está instalado, fallback automático abre site.',
  parameters: {
    type: 'object',
    properties: {
      app: {
        type: 'string',
        description: 'Nome do app. Aceita PT-BR e EN (calculadora, calculator, calc, bloco de notas, notepad, paint, etc). Se o nome não estiver no registry, tenta executar como comando direto.',
      },
    },
    required: ['app'],
  },
}

function buildLookupTable() {
  const platform = process.platform
  const registry = APP_REGISTRY[platform] || {}
  const lookup = {}
  for (const [key, def] of Object.entries(registry)) {
    lookup[key.toLowerCase()] = { name: key, ...def }
    if (Array.isArray(def.alias)) {
      for (const a of def.alias) {
        lookup[a.toLowerCase()] = { name: key, ...def }
      }
    }
  }
  return lookup
}

function resolveApp(rawName) {
  if (!rawName) return null
  const lookup = buildLookupTable()
  const lc = String(rawName).trim().toLowerCase()
  // limpa "o ", "a ", "do ", etc
  const cleaned = lc.replace(/^(o|a|do|da|no|na|um|uma|the)\s+/i, '')

  if (lookup[cleaned]) return lookup[cleaned]
  if (lookup[lc]) return lookup[lc]

  // Substring match — "abrir o vsc" → vscode
  for (const [key, def] of Object.entries(lookup)) {
    if (cleaned.includes(key) || (key.length >= 3 && key.includes(cleaned))) {
      return def
    }
  }

  return null
}

async function spawnApp(spec) {
  const platform = process.platform
  const cmd = spec.cmd
  const args = spec.args || []

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        shell: !!spec.shell,
        windowsHide: false,
      })

      let resolved = false
      let errMsg = null

      child.on('error', (err) => {
        errMsg = err.message
        if (!resolved) {
          resolved = true
          resolve({ ok: false, error: errMsg, code: err.code })
        }
      })

      // Apps spawned com detached + unref retornam imediatamente.
      // Esperamos 200ms pra capturar erros de spawn (ex: ENOENT).
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (child.unref) child.unref()
          resolve({ ok: true, pid: child.pid })
        }
      }, 200)
    } catch (err) {
      resolve({ ok: false, error: err.message })
    }
  })
}

async function fallbackBrowser(url) {
  const platform = process.platform
  let cmd, args
  if (platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '""', url] }
  else if (platform === 'darwin') { cmd = 'open'; args = [url] }
  else { cmd = 'xdg-open'; args = [url] }
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      if (child.unref) child.unref()
      resolve({ ok: true })
    } catch (err) {
      resolve({ ok: false, error: err.message })
    }
  })
}

export async function execute(args = {}) {
  const platform = process.platform
  if (!APP_REGISTRY[platform]) {
    return { ok: false, error: `Plataforma "${platform}" não suportada` }
  }

  const spec = resolveApp(args.app)

  // Fallback: tenta executar nome direto se não estiver no registry
  if (!spec) {
    log.warn(`app "${args.app}" não está no registry, tentando spawn direto`)
    const direct = await spawnApp({ cmd: String(args.app).trim() })
    if (direct.ok) {
      return {
        ok: true,
        app: args.app,
        method: 'direct_spawn',
        message: `Abri ${args.app}.`,
      }
    }
    return {
      ok: false,
      error: `App "${args.app}" não foi encontrado.`,
      hint: 'Verifique se o programa está instalado. Se for um site, use browser_open.',
      supported: Object.keys(APP_REGISTRY[platform]).slice(0, 20),
    }
  }

  const result = await spawnApp(spec)

  if (result.ok) {
    return {
      ok: true,
      app: spec.name,
      method: 'registry',
      message: `Abri ${spec.name}.`,
    }
  }

  // Falhou — tenta fallback URL (ex: Spotify desktop não instalado → web)
  if (spec.fallback_url) {
    log.info(`spawn falhou pra "${spec.name}", caindo pra fallback URL ${spec.fallback_url}`)
    const fb = await fallbackBrowser(spec.fallback_url)
    if (fb.ok) {
      return {
        ok: true,
        app: spec.name,
        method: 'browser_fallback',
        url: spec.fallback_url,
        message: `${spec.name} desktop não detectado. Abri a versão web no navegador.`,
      }
    }
  }

  return {
    ok: false,
    error: result.error || `Não consegui abrir "${spec.name}"`,
    hint: result.code === 'ENOENT'
      ? `O programa "${spec.name}" não parece estar instalado.`
      : 'Verifique se o programa está instalado e na PATH.',
  }
}

// Exports pra testes
export { APP_REGISTRY, resolveApp }
