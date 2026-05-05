/**
 * tests/smoke.js — Smoke test mínimo. Roda servidor, faz queries reais, valida.
 *
 * Uso:
 *   1. Tem `.env` com OPENAI_API_KEY
 *   2. `node tests/smoke.js`
 *   3. Espera 30-60s, verifica resultados
 *
 * Mata processo no fim — não deixa servidor rodando.
 */

import 'dotenv/config'
import { spawn } from 'child_process'
import http from 'http'

const PORT = Number(process.env.PORT) || 5070
const QUERIES = [
  // Reflex (zero-LLM)
  { input: 'oi', expect: { reflex: true } },
  { input: 'bom dia', expect: { reflex: true } },
  { input: 'obrigado', expect: { reflex: true } },
  // System info (tool)
  { input: 'que horas são', expect: { hasTool: 'system_info', or_text: /\d{1,2}/ } },
  // Memory save
  { input: 'salva: meu cep é 01310-100', expect: { hasTool: 'memory_op' } },
  // Web search
  { input: 'pesquise quem é o presidente do Brasil', expect: { hasTool: 'web_search', or_any: true } },
  // Browser open
  { input: 'abre o google', expect: { hasTool: 'browser_open' } },
  // Browser search
  { input: 'pesquisa pizza no google', expect: { hasTool: 'browser_search' } },
]

function callChat(message, sessionId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ session: sessionId, message })
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: '/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 60000,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))) }
        catch { resolve({ error: 'invalid json' }) }
      })
    })
    req.on('error', err => resolve({ error: err.message }))
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }) })
    req.write(data)
    req.end()
  })
}

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

async function main() {
  console.log('═══ Kerneo Lite — smoke test ═══\n')

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY não setada. Configure .env primeiro.')
    process.exit(1)
  }

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

  // Run queries
  const sessionId = `smoke_${Date.now()}`
  let ok = 0, fail = 0

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i]
    process.stdout.write(`[${i + 1}/${QUERIES.length}] "${q.input}" ... `)
    const t0 = Date.now()
    const r = await callChat(q.input, sessionId)
    const dt = Date.now() - t0

    let pass = false
    let reason = ''
    if (r.error) {
      reason = r.error
    } else if (q.expect.reflex && r.from_reflex) {
      pass = true
    } else if (q.expect.hasTool) {
      const used = (r.tool_calls || []).map(tc => tc.name)
      if (used.includes(q.expect.hasTool)) {
        pass = true
      } else if (q.expect.or_text && r.text && q.expect.or_text.test(r.text)) {
        pass = true
      } else if (q.expect.or_any && r.text && r.text.length > 5) {
        pass = true
      } else {
        reason = `tool ${q.expect.hasTool} não chamada (used: ${used.join(',') || 'none'})`
      }
    } else {
      pass = !!r.text
      if (!pass) reason = 'sem resposta'
    }

    if (pass) { console.log(`✓ ${dt}ms`); ok++ }
    else { console.log(`✗ ${dt}ms — ${reason}`); fail++ }
  }

  console.log(`\n═══ Resultado: ${ok}/${QUERIES.length} ok, ${fail} falharam ═══`)
  proc.kill()
  setTimeout(() => process.exit(fail > 0 ? 1 : 0), 500)
}

main().catch(err => {
  console.error('crash:', err)
  process.exit(2)
})
