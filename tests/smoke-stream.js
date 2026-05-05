/**
 * tests/smoke-stream.js — Smoke test do endpoint /chat/stream (SSE).
 *
 * Valida:
 *   - SSE conecta e recebe eventos
 *   - Parse de "data: {...}\n\n"
 *   - Recebe pelo menos 1 evento { type: 'text' } com content não vazio
 *   - Recebe { type: 'done' } no fim
 *   - Reflex shortcuts ("oi") emitem evento reflex
 *   - Tool calls emitem tool_call_start + tool_call_end
 *
 * Uso:
 *   1. Tem .env com pelo menos 1 provider key
 *   2. node tests/smoke-stream.js
 */

import 'dotenv/config'
import { spawn } from 'child_process'
import http from 'http'

const PORT = Number(process.env.PORT) || 5070

function waitHealth(maxMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve(true)
        else if (Date.now() - start > maxMs) resolve(false)
        else setTimeout(probe, 500)
      })
      req.on('error', () => {
        if (Date.now() - start > maxMs) resolve(false)
        else setTimeout(probe, 500)
      })
    }
    probe()
  })
}

/**
 * Faz POST /chat/stream e parseia SSE. Resolve com array de eventos.
 */
function streamChat(message, sessionId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ session: sessionId, message })
    const events = []
    let buffer = ''
    let firstByteAt = null
    let firstTextAt = null
    const t0 = Date.now()

    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: '/chat/stream', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.setEncoding('utf-8')
      res.on('data', (chunk) => {
        if (!firstByteAt) firstByteAt = Date.now() - t0
        buffer += chunk
        let sep
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          let payload = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) payload += line.slice(6)
          }
          if (!payload) continue
          try {
            const evt = JSON.parse(payload)
            events.push(evt)
            if (evt.type === 'text' && !firstTextAt) firstTextAt = Date.now() - t0
          } catch (e) { /* ignore malformed */ }
        }
      })
      res.on('end', () => resolve({ events, firstByteAt, firstTextAt, totalMs: Date.now() - t0 }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(data)
    req.end()
  })
}

const TESTS = [
  {
    name: 'Reflex (oi) — instant text',
    input: 'oi',
    validate: (r) => {
      const reflex = r.events.find(e => e.type === 'reflex')
      const done = r.events.find(e => e.type === 'done')
      if (!reflex) return 'sem evento reflex'
      if (!done) return 'sem evento done'
      if (!reflex.text) return 'reflex sem texto'
      return null
    },
  },
  {
    name: 'Reflex tool (que horas) — emite tool_call_start/end',
    input: 'que horas são',
    validate: (r) => {
      const start = r.events.find(e => e.type === 'tool_call_start')
      const end = r.events.find(e => e.type === 'tool_call_end')
      if (!start) return 'sem tool_call_start'
      if (!end) return 'sem tool_call_end'
      if (start.name !== 'system_info') return `tool errada: ${start.name}`
      return null
    },
  },
  {
    name: 'LLM stream (texto livre) — recebe múltiplos text events',
    input: 'me explique em uma frase o que é o oceano',
    validate: (r) => {
      const textEvents = r.events.filter(e => e.type === 'text')
      const done = r.events.find(e => e.type === 'done')
      if (textEvents.length === 0) return 'sem text events'
      if (!done) return 'sem done'
      const totalText = textEvents.map(e => e.content).join('')
      if (totalText.length < 10) return `texto curto demais: "${totalText}"`
      // Streaming bom: TTFB < 5s e múltiplos chunks
      if (textEvents.length < 2) return `só ${textEvents.length} chunk — não é streaming verdadeiro`
      return null
    },
  },
]

async function main() {
  console.log('═══ Kerneo Lite — stream smoke test ═══\n')

  // Spawn server
  console.log('▸ Iniciando servidor...')
  const proc = spawn('node', ['src/server.js'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, LOG_LEVEL: 'warn' },
  })

  const ready = await waitHealth()
  if (!ready) {
    console.error('❌ Servidor não respondeu em 15s')
    proc.kill()
    process.exit(1)
  }
  console.log('▸ Servidor up ✓\n')

  const sessionId = `smoke_stream_${Date.now()}`
  let ok = 0, fail = 0

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i]
    process.stdout.write(`[${i + 1}/${TESTS.length}] ${t.name} ... `)
    try {
      const r = await streamChat(t.input, sessionId)
      const reason = t.validate(r)
      if (!reason) {
        const ttfb = r.firstByteAt ?? '?'
        const ttft = r.firstTextAt ?? '?'
        console.log(`✓ TTFB=${ttfb}ms TTFT=${ttft}ms total=${r.totalMs}ms (${r.events.length} eventos)`)
        ok++
      } else {
        console.log(`✗ ${reason}`)
        console.log(`   eventos: ${r.events.map(e => e.type).join(', ')}`)
        fail++
      }
    } catch (err) {
      console.log(`✗ ERRO: ${err.message}`)
      fail++
    }
  }

  console.log(`\n═══ Resultado: ${ok}/${TESTS.length} ok, ${fail} falharam ═══`)
  proc.kill()
  setTimeout(() => process.exit(fail > 0 ? 1 : 0), 500)
}

main().catch(err => {
  console.error('crash:', err)
  process.exit(2)
})
