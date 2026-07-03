/**
 * server.js — Entrypoint HTTP + HTTPS + WebSocket.
 *
 * Endpoints:
 *   GET  /              → GUI (public/index.html)
 *   GET  /health        → status
 *   POST /chat          → orquestrador (JSON: {session, message})
 *   POST /tts           → TTS streaming (JSON: {text})
 *   POST /stt           → Whisper transcribe (multipart audio file)
 *   POST /tools/exec    → executa tool específica (debug)
 *   GET  /tools         → lista tools disponíveis
 *
 * Modo dual:
 *   HTTP em PORT (default 5070) — pra dev/teste rápido
 *   HTTPS em PORT+1 (default 5071) — pra mic seguro (cert self-signed auto-gerado)
 */

import './utils/env.js'
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ToolRegistry } from './tools/registry.js'
import { MemoryStore } from './memory/store.js'
import { Orchestrator } from './orchestrator/index.js'
import { ttsStream } from './voice/tts.js'
import { stt as whisperSTT, complete as llmComplete, getProviderInfo } from './llm/index.js'
import { setStore as setMemoryToolStore } from './tools/memory_op.js'
import { setRegistry as setSkillCreateRegistry, setLLMRouter as setSkillCreateLLM } from './tools/skill_create.js'
import { setRegistry as setSkillListRegistry } from './tools/skill_list.js'
import { setRegistry as setSkillRemoveRegistry } from './tools/skill_remove.js'
import { setRegistry as setHelpRegistry } from './tools/kerneo_help.js'
import { setRegistry as setSkillShareRegistry } from './tools/skill_share.js'
import { setRegistry as setSkillInstallUrlRegistry } from './tools/skill_install_url.js'
import { setRegistry as setSkillIterateRegistry, setLLMRouter as setSkillIterateLLM } from './tools/skill_iterate.js'
import { setLLMRouter as setScreenCaptureLLM } from './tools/screen_capture.js'
import { ensureCerts } from './utils/certs.js'
import {
  loadConfig,
  configInfo,
  saveConfig,
  maskedConfig,
  testProviderKey,
  invalidateCache as invalidateConfigCache,
} from './utils/config.js'
import { resetCache as resetLLMCache } from './llm/index.js'
import { makeLogger } from './utils/logger.js'

const log = makeLogger('server')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── Carrega config (config.json + .env overrides) ──
const config = loadConfig()
const PORT_HTTP = config.server.port
const PORT_HTTPS = config.server.httpsPort
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const BIND_HOST = config.server.bindLan ? '0.0.0.0' : '127.0.0.1'
const HTTPS_ENABLED = config.server.httpsEnabled

// ── Bootstrap ──
log.info('booting...')

// Valida que tem pelo menos 1 provider configurado
let providerInfo
try {
  providerInfo = getProviderInfo()
  log.info(`LLM chain: ${providerInfo.chain.join(' → ')} (primário: ${providerInfo.primary})`)
} catch (err) {
  log.error(err.message)
  log.error('Edite config.json (recomendado) ou .env')
  log.error(`Caminho config: ${path.join(process.cwd(), 'config.json')}`)
  log.error(`Caminho env:    ${path.join(process.cwd(), '.env')}`)
  log.error('')
  log.error('Recomendado começar com Groq (FREE TIER, sem cartão):')
  log.error('  1. Pegue key em https://console.groq.com')
  log.error('  2. Edite config.json: providers.groq.apiKey = "gsk_..."')
  process.exit(1)
}

const memoryStore = new MemoryStore(DATA_DIR)
setMemoryToolStore(memoryStore)

const toolRegistry = new ToolRegistry()
await toolRegistry.discover()

// Inject registry + llm router pros tools que precisam (skill_*, help, share)
setSkillCreateRegistry(toolRegistry)
setSkillCreateLLM({ complete: llmComplete })
setSkillListRegistry(toolRegistry)
setSkillRemoveRegistry(toolRegistry)
setHelpRegistry(toolRegistry)
setSkillShareRegistry(toolRegistry)
setSkillInstallUrlRegistry(toolRegistry)
setSkillIterateRegistry(toolRegistry)
setSkillIterateLLM({ complete: llmComplete })
setScreenCaptureLLM({ complete: llmComplete })

const orchestrator = new Orchestrator({ toolRegistry, memoryStore })

// ── HTTP utils ──
function json(res, status, body) {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', c => {
      total += c.length
      if (total > maxBytes) {
        req.destroy()
        return reject(new Error(`body too large (>${maxBytes} bytes)`))
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req) {
  const buf = await readBody(req)
  const text = buf.toString('utf-8')
  if (!text) return {}
  try { return JSON.parse(text) }
  catch (err) { throw new Error('invalid JSON: ' + err.message) }
}

function isLoopback(req) {
  const ip = req.socket?.remoteAddress || ''
  return ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127')
}

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '')
  const abs = path.join(PUBLIC_DIR, filePath)
  if (!abs.startsWith(PUBLIC_DIR)) { json(res, 403, { error: 'forbidden' }); return }
  fs.readFile(abs, (err, data) => {
    if (err) { json(res, 404, { error: 'not_found', path: urlPath }); return }
    const ext = path.extname(abs).toLowerCase()
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(data)
  })
}

// ── HTTP handler ──
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const route = `${req.method} ${url.pathname}`

  // CORS — permite GUI servida de qualquer origem (security via loopback ainda aplica)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  try {
    // GET /health
    if (route === 'GET /health') {
      const info = configInfo(config)
      return json(res, 200, {
        ready: true,
        ts: Date.now(),
        version: '0.3.0',
        tools: toolRegistry.list().length,
        provider: info.provider,
        https: HTTPS_ENABLED,
        skills_auto_create: info.skills_auto_create,
      })
    }

    // GET /tools
    if (route === 'GET /tools') {
      return json(res, 200, { tools: toolRegistry.list() })
    }

    // POST /chat
    if (route === 'POST /chat') {
      const body = await readJsonBody(req)
      const sessionId = body.session || body.sessionId || 'default'
      const message = (body.message || body.text || '').trim()
      if (!message) return json(res, 400, { error: 'message obrigatória' })

      try {
        const result = await orchestrator.handleRequest({ sessionId, userInput: message })
        return json(res, 200, {
          ok: true,
          text: result.text,
          tool_calls: result.tool_calls,
          from_reflex: result.from_reflex || false,
          iterations: result.iterations || 0,
          duration_ms: result.duration_ms,
        })
      } catch (err) {
        log.error('chat falhou', { err: err.message })
        return json(res, 200, {
          ok: false,
          error: err.message,
          text: 'Desculpa, deu erro. Tenta de novo em um instante.',
        })
      }
    }

    // POST /chat/stream — SSE (Server-Sent Events)
    // Body: { session, message } → stream de eventos { type: 'text'|'tool_call_*'|'done'|... }
    // Eventos: data: {json}\n\n
    if (route === 'POST /chat/stream') {
      const body = await readJsonBody(req)
      const sessionId = body.session || body.sessionId || 'default'
      const message = (body.message || body.text || '').trim()
      if (!message) return json(res, 400, { error: 'message obrigatória' })

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',  // nginx/proxy: não bufferizar
      })

      // Heartbeat pra manter conexão viva durante long thinks
      const heartbeat = setInterval(() => {
        try { res.write(': ping\n\n') } catch {}
      }, 15000)

      // Aborta orchestrator se cliente desconectar
      const ac = new AbortController()
      req.on('close', () => {
        ac.abort()
        clearInterval(heartbeat)
      })

      const t0 = Date.now()
      try {
        for await (const event of orchestrator.handleRequestStream({
          sessionId, userInput: message, signal: ac.signal,
        })) {
          if (res.writableEnded) break
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          log.error('chat/stream falhou', { err: err.message })
          try {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              message: err.message || 'erro interno',
            })}\n\n`)
          } catch {}
        }
      } finally {
        clearInterval(heartbeat)
        try { res.end() } catch {}
        log.info('stream done', { dt_ms: Date.now() - t0, msg: message.slice(0, 30) })
      }
      return
    }

    // POST /tts (audio MP3)
    if (route === 'POST /tts') {
      const body = await readJsonBody(req)
      const text = (body.text || '').trim()
      if (!text) return json(res, 400, { error: 'text obrigatório' })
      try {
        const buf = await ttsStream({ text, voice: body.voice, speed: body.speed })
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buf.length,
          'Cache-Control': 'no-cache',
        })
        res.end(buf)
      } catch (err) {
        log.warn('TTS falhou', { err: err.message })
        if (!res.headersSent) json(res, 500, { error: err.message })
      }
      return
    }

    // POST /stt (Whisper transcribe — fallback quando Web Speech falha)
    // Body: raw audio bytes (Content-Type: audio/webm | audio/mp4 | etc)
    if (route === 'POST /stt') {
      const contentType = req.headers['content-type'] || 'audio/webm'
      try {
        const audioBuf = await readBody(req, 25 * 1024 * 1024)  // 25MB max
        if (audioBuf.length < 1000) {
          return json(res, 400, { error: 'áudio muito pequeno', size: audioBuf.length })
        }
        log.info('STT request', { size_kb: Math.round(audioBuf.length / 1024), mime: contentType })

        // Detect extension from mime
        let filename = 'audio.webm'
        if (contentType.includes('mp4')) filename = 'audio.mp4'
        else if (contentType.includes('ogg')) filename = 'audio.ogg'
        else if (contentType.includes('wav')) filename = 'audio.wav'
        else if (contentType.includes('mpeg')) filename = 'audio.mp3'

        const result = await whisperSTT(audioBuf, {
          filename,
          mimeType: contentType,
          language: 'pt',
        })
        return json(res, 200, { ok: true, text: result.text, model: result.model })
      } catch (err) {
        log.warn('STT falhou', { err: err.message })
        return json(res, 500, { ok: false, error: err.message })
      }
    }

    // ── Config API (loopback only — segurança) ──
    // GET /api/config — retorna config com keys mascaradas
    if (route === 'GET /api/config') {
      if (!isLoopback(req)) return json(res, 403, { error: 'loopback_only' })
      try {
        const masked = maskedConfig()
        return json(res, 200, masked)
      } catch (err) {
        return json(res, 500, { error: err.message })
      }
    }

    // POST /api/config — atualiza config (apiKey, provider, voice, etc)
    // Body: { providers?: {groq: {apiKey: "..."}}, provider?: "openai", voice?: {...} }
    if (route === 'POST /api/config') {
      if (!isLoopback(req)) return json(res, 403, { error: 'loopback_only' })
      try {
        const body = await readJsonBody(req)
        const result = saveConfig(body)
        if (!result.ok) return json(res, 500, result)

        // Reset LLM router pra usar config nova
        resetLLMCache()
        invalidateConfigCache()

        // Re-detect provider primário pra retornar info
        let info
        try { info = configInfo(loadConfig(true)) }
        catch (err) { info = { error: err.message } }

        return json(res, 200, {
          ok: true,
          message: 'Config salvo. Mudanças aplicam IMEDIATAMENTE (sem restart).',
          path: result.path,
          new_provider: info.provider,
          chain: info.chain,
        })
      } catch (err) {
        return json(res, 400, { error: err.message })
      }
    }

    // POST /api/config/test — testa apiKey sem salvar
    // Body: { provider: "openai", apiKey: "sk-...", baseUrl?: "..." }
    if (route === 'POST /api/config/test') {
      if (!isLoopback(req)) return json(res, 403, { error: 'loopback_only' })
      try {
        const body = await readJsonBody(req)
        if (!body.provider || !body.apiKey) {
          return json(res, 400, { error: 'provider e apiKey obrigatórios' })
        }
        const result = await testProviderKey(body.provider, body.apiKey, body.baseUrl)
        return json(res, 200, result)
      } catch (err) {
        return json(res, 500, { error: err.message })
      }
    }

    // POST /tools/exec (loopback only — debug)
    if (route === 'POST /tools/exec') {
      if (!isLoopback(req)) return json(res, 403, { error: 'loopback_only' })
      const body = await readJsonBody(req)
      const tool = toolRegistry.get(body.tool)
      if (!tool) return json(res, 404, { error: `tool not found: ${body.tool}` })
      try {
        const out = await tool.execute(body.args || {})
        return json(res, 200, { ok: true, output: out })
      } catch (err) {
        return json(res, 200, { ok: false, error: err.message })
      }
    }

    // Static
    if (req.method === 'GET') {
      return serveStatic(req, res, url.pathname)
    }

    json(res, 404, { error: 'not_found', route })
  } catch (err) {
    log.error('handler crash', { err: err.message, stack: err.stack?.split('\n')[1]?.trim() })
    if (!res.headersSent) json(res, 500, { error: err.message })
  }
}

// ── Boot dual: HTTP + HTTPS ──
const httpServer = http.createServer(handleRequest)
httpServer.listen(PORT_HTTP, BIND_HOST, () => {
  log.info(`HTTP listening on ${BIND_HOST}:${PORT_HTTP}`)
})
httpServer.on('error', (err) => {
  log.error(`HTTP server error: ${err.message}`)
  if (err.code === 'EADDRINUSE') {
    log.error(`Porta ${PORT_HTTP} já em uso. Edite .env e mude PORT.`)
    process.exit(1)
  }
})

let httpsServer = null
let httpsUp = false

if (HTTPS_ENABLED) {
  try {
    const { cert, key } = ensureCerts(DATA_DIR)
    httpsServer = https.createServer({ cert, key }, handleRequest)
    httpsServer.listen(PORT_HTTPS, BIND_HOST, () => {
      httpsUp = true
      log.info(`HTTPS listening on ${BIND_HOST}:${PORT_HTTPS}`)
    })
    httpsServer.on('error', (err) => {
      log.warn(`HTTPS server error: ${err.message}`)
      if (err.code === 'EADDRINUSE') {
        log.warn(`Porta HTTPS ${PORT_HTTPS} ocupada — só HTTP disponível`)
      }
    })
  } catch (err) {
    log.warn(`HTTPS setup falhou: ${err.message} — continuando só HTTP`)
  }
}

// Aguarda HTTPS subir (ou timeout) antes de imprimir banner
setTimeout(() => {
  const localhost = BIND_HOST === '0.0.0.0' ? 'localhost' : BIND_HOST
  const httpUrl = `http://${localhost}:${PORT_HTTP}`
  const httpsUrl = httpsUp ? `https://${localhost}:${PORT_HTTPS}` : null
  log.info('═══════════════════════════════════════════════')
  log.info(`✅ Samaritano online (Tiago Rocha)`)
  log.info(`   HTTP:  ${httpUrl}`)
  if (httpsUrl) log.info(`   HTTPS: ${httpsUrl}  (recomendado pra microfone)`)
  log.info(`   Health: ${httpUrl}/health`)
  log.info(`   Tools:  ${toolRegistry.list().map(t => t.name).join(', ')}`)
  log.info('═══════════════════════════════════════════════')
}, 500)

// Graceful shutdown
function shutdown(sig) {
  log.info(`received ${sig}, shutting down...`)
  let closed = 0
  const total = (httpsServer ? 2 : 1)
  const done = () => {
    closed++
    if (closed >= total) { memoryStore.close(); process.exit(0) }
  }
  httpServer.close(done)
  if (httpsServer) httpsServer.close(done)
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
