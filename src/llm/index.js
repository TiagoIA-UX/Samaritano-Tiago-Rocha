/**
 * llm/index.js — Router universal de LLM.
 *
 * Suporta:
 *   - OpenAI-compatible (via baseUrl custom): OpenAI, DeepSeek, Groq, Gemini,
 *     OpenRouter, Ollama, qualquer provider que aceita formato OpenAI Chat
 *   - Anthropic (formato Messages API próprio, adapter dedicado)
 *
 * Auto-detecta provider via config.json + .env. Cliente cacheado.
 *
 * TTS/STT/Vision: sempre via OpenAI quando openai.apiKey disponível
 * (outros providers não suportam ou suportam formato incompatível).
 */

import OpenAI from 'openai'
import { loadConfig, detectProvider, buildProviderChain } from '../utils/config.js'
import { makeLogger } from '../utils/logger.js'

const log = makeLogger('llm')

let _config = null
let _chain = []
let _clients = new Map()  // provider name → client/adapter
let _degraded = new Map() // provider name → timestamp degraded until

const DEGRADE_DURATION_MS = 60_000  // 1 min de cooldown quando provider falha

function _init() {
  if (_chain.length > 0 && _config) return
  _config = loadConfig()
  _chain = buildProviderChain(_config)
  if (_chain.length === 0) {
    throw new Error(
      'Nenhum provider LLM configurado. Edite config.json ou .env.\n' +
      'Recomendado começar com Groq (grátis): https://console.groq.com\n' +
      'Outras opções: OpenAI (https://platform.openai.com/api-keys), Gemini, Anthropic, etc.'
    )
  }
  log.info(`provider chain: ${_chain.join(' → ')} (primário: ${_chain[0]})`)
}

function _buildClient(name) {
  const p = _config.providers[name]
  if (!p) return null
  if (name === 'anthropic') {
    return { __anthropic: true, apiKey: p.apiKey, baseURL: p.baseUrl }
  }
  return new OpenAI({
    apiKey: p.apiKey || 'no-key',
    baseURL: p.baseUrl,
  })
}

function _getClient(name) {
  if (_clients.has(name)) return _clients.get(name)
  const c = _buildClient(name)
  if (c) _clients.set(name, c)
  return c
}

function _isDegraded(name) {
  const until = _degraded.get(name) || 0
  return until > Date.now()
}

function _markDegraded(name, reason) {
  _degraded.set(name, Date.now() + DEGRADE_DURATION_MS)
  log.warn(`provider "${name}" degraded por ${DEGRADE_DURATION_MS / 1000}s: ${reason}`)
}

function _markRecovered(name) {
  if (_degraded.has(name)) {
    _degraded.delete(name)
    log.info(`provider "${name}" recovered`)
  }
}

/** Retorna o primeiro provider healthy da chain. Se todos degraded, primeiro mesmo (best-effort) */
function _pickProvider() {
  for (const name of _chain) {
    if (!_isDegraded(name)) return name
  }
  return _chain[0]  // fallback best-effort
}

function _isRetryableError(err) {
  if (!err) return false
  const msg = String(err.message || '').toLowerCase()
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') return true
  if (err.status === 429 || err.status === 502 || err.status === 503 || err.status === 504) return true
  if (msg.includes('rate limit') || msg.includes('overloaded') || msg.includes('timeout')) return true
  return false
}

function getOpenAIForExtras() {
  // TTS/STT/Vision usam OpenAI direto (precisa openai.apiKey no config).
  const cfg = _config || loadConfig()
  const oai = cfg.providers.openai
  if (oai?.apiKey) {
    return new OpenAI({ apiKey: oai.apiKey, baseURL: oai.baseUrl })
  }
  return null
}

function resolveModel(provider, hint) {
  const p = _config.providers[provider]
  if (!hint) return p.models?.fast
  return p.models?.[hint] || hint
}

/**
 * Chat completion com FALLBACK AUTOMÁTICO entre providers.
 * Se Groq cair, tenta OpenAI; se OpenAI cair, tenta Gemini; etc.
 */
export async function chat(opts) {
  _init()
  const messages = [...opts.messages]
  if (opts.system && messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: opts.system })
  }

  const errors = []
  for (const provider of _chain) {
    if (_isDegraded(provider)) continue

    const model = resolveModel(provider, opts.model)
    try {
      let result
      if (provider === 'anthropic') {
        result = await chatAnthropic(provider, model, messages, opts)
      } else {
        result = await chatOpenAICompat(provider, model, messages, opts)
      }
      _markRecovered(provider)
      return result
    } catch (err) {
      errors.push({ provider, error: err.message?.slice(0, 100) })
      log.warn(`provider "${provider}" falhou (${err.status || err.code || 'err'}): ${err.message?.slice(0, 100)}`)

      if (_isRetryableError(err)) {
        _markDegraded(provider, err.message?.slice(0, 60))
        continue  // tenta próximo
      }
      // Erro não-retryable (key inválida, etc) — também tenta próximo
      _markDegraded(provider, 'non-retryable error')
      continue
    }
  }

  // Todos providers falharam
  throw new Error(
    `Todos providers LLM falharam. Última tentativa: ${errors.map(e => `${e.provider}=${e.error}`).join(' | ')}`
  )
}

async function chatOpenAICompat(provider, model, messages, opts) {
  const client = _getClient(provider)
  const params = {
    model,
    messages,
    max_tokens: opts.max_tokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
  }
  if (opts.tools) params.tools = opts.tools
  if (opts.json) params.response_format = { type: 'json_object' }

  const t0 = Date.now()
  const resp = await client.chat.completions.create(params, { signal: opts.signal })
  const choice = resp.choices?.[0]
  return {
    content: choice?.message?.content || '',
    tool_calls: choice?.message?.tool_calls || [],
    finish_reason: choice?.finish_reason,
    usage: resp.usage,
    model: resp.model,
    duration_ms: Date.now() - t0,
    provider,
  }
}

/**
 * Streaming chat — emite eventos conforme tokens chegam do LLM.
 *
 * Yields:
 *   { type: 'text', content: 'tokens...' }
 *   { type: 'tool_calls', tool_calls: [...] }   (quando finish_reason === 'tool_calls')
 *   { type: 'done', model, provider }            (finish_reason === 'stop')
 *
 * Erro de provider → tenta próximo na chain (igual chat() não-stream).
 */
export async function* chatStream(opts) {
  _init()
  const messages = [...opts.messages]
  if (opts.system && messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: opts.system })
  }

  const errors = []
  for (const provider of _chain) {
    if (_isDegraded(provider)) continue
    const model = resolveModel(provider, opts.model)

    try {
      // Anthropic ainda não suporta streaming aqui (uso mais raro)
      if (provider === 'anthropic') {
        // Fallback non-streaming pra Anthropic
        const result = await chatAnthropic(provider, model, messages, opts)
        if (result.content) yield { type: 'text', content: result.content }
        if (result.tool_calls?.length) yield { type: 'tool_calls', tool_calls: result.tool_calls }
        yield { type: 'done', model: result.model, provider, usage: result.usage }
        _markRecovered(provider)
        return
      }

      yield* streamOpenAICompat(provider, model, messages, opts)
      _markRecovered(provider)
      return
    } catch (err) {
      errors.push({ provider, error: err.message?.slice(0, 100) })
      log.warn(`stream "${provider}" falhou: ${err.message?.slice(0, 100)}`)
      if (_isRetryableError(err)) {
        _markDegraded(provider, err.message?.slice(0, 60))
      } else {
        _markDegraded(provider, 'non-retryable')
      }
      continue
    }
  }

  throw new Error(
    `Todos providers LLM falharam (stream). Erros: ${errors.map(e => `${e.provider}=${e.error}`).join(' | ')}`
  )
}

async function* streamOpenAICompat(provider, model, messages, opts) {
  const client = _getClient(provider)
  const params = {
    model,
    messages,
    max_tokens: opts.max_tokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    stream: true,
  }
  if (opts.tools) params.tools = opts.tools

  const stream = await client.chat.completions.create(params, { signal: opts.signal })

  // Tool calls chegam fragmentados — montamos por index
  const pendingToolCalls = []
  let finishReason = null

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0]
    if (!choice) continue
    const delta = choice.delta || {}

    if (delta.content) {
      yield { type: 'text', content: delta.content }
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        if (!pendingToolCalls[idx]) {
          pendingToolCalls[idx] = {
            id: tc.id || `call_${idx}_${Date.now()}`,
            type: 'function',
            function: { name: '', arguments: '' },
          }
        }
        if (tc.id) pendingToolCalls[idx].id = tc.id
        if (tc.function?.name) pendingToolCalls[idx].function.name += tc.function.name
        if (tc.function?.arguments) pendingToolCalls[idx].function.arguments += tc.function.arguments
      }
    }

    if (choice.finish_reason) {
      finishReason = choice.finish_reason
    }
  }

  // Após stream completo, decide o que emitir
  const validTools = pendingToolCalls.filter(t => t && t.function?.name)
  if (finishReason === 'tool_calls' || validTools.length > 0) {
    yield { type: 'tool_calls', tool_calls: validTools }
  }
  yield { type: 'done', model, provider, finish_reason: finishReason }
}


/**
 * Adapter Anthropic Messages API (formato próprio: system separado).
 */
async function chatAnthropic(provider, model, messages, opts) {
  const client = _getClient(provider)
  const sys = messages.find(m => m.role === 'system')?.content || ''
  const conv = messages.filter(m => m.role !== 'system')

  const t0 = Date.now()
  const body = {
    model,
    max_tokens: opts.max_tokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    messages: conv.map(m => ({ role: m.role, content: m.content })),
  }
  if (sys) body.system = sys
  if (opts.tools) {
    body.tools = opts.tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }))
  }

  const res = await fetch(`${client.baseURL || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': client.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    const errText = await res.text()
    const err = new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const j = await res.json()
  const textBlocks = (j.content || []).filter(b => b.type === 'text')
  const toolBlocks = (j.content || []).filter(b => b.type === 'tool_use')
  const toolCalls = toolBlocks.map(b => ({
    id: b.id,
    type: 'function',
    function: { name: b.name, arguments: JSON.stringify(b.input) },
  }))
  return {
    content: textBlocks.map(b => b.text).join('\n'),
    tool_calls: toolCalls,
    finish_reason: j.stop_reason,
    usage: j.usage,
    model: j.model,
    duration_ms: Date.now() - t0,
    provider,
  }
}

/**
 * Helper compatível com chamadas antigas: `complete()` é alias de `chat()` com
 * normalização. Usado pelo skill_create + outros que querem text simples.
 */
export async function complete(opts) {
  return await chat(opts)
}

/**
 * Vision — usa OpenAI/Gemini/Anthropic. Fallback automático.
 */
export async function vision(opts) {
  _init()
  // Tenta o primeiro provider da chain que suporta vision
  const visionCapable = ['openai', 'gemini', 'openrouter', 'anthropic']
  const candidate = _chain.find(p => visionCapable.includes(p) && !_isDegraded(p))

  if (candidate && candidate !== 'anthropic') {
    const client = _getClient(candidate)
    const model = resolveModel(candidate, 'vision') || resolveModel(candidate, 'smart')
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: opts.image_url, detail: opts.detail || 'auto' } },
          { type: 'text', text: opts.question },
        ],
      }],
    })
    return {
      analysis: resp.choices?.[0]?.message?.content || '',
      usage: resp.usage,
      model: resp.model,
    }
  }

  // Último recurso: OpenAI direto via getOpenAIForExtras
  const oai = getOpenAIForExtras()
  if (!oai) throw new Error('Vision requer OpenAI/Gemini/OpenRouter/Anthropic com apiKey configurado')
  const resp = await oai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: opts.image_url, detail: opts.detail || 'auto' } },
        { type: 'text', text: opts.question },
      ],
    }],
  })
  return {
    analysis: resp.choices?.[0]?.message?.content || '',
    usage: resp.usage,
    model: resp.model,
  }
}

/**
 * Web search — só OpenAI tem built-in. Fallback DDG está no web_search.js.
 */
export async function webSearch(query, opts = {}) {
  _init()
  const oai = getOpenAIForExtras() || (_chain[0] === 'openai' ? _getClient('openai') : null)
  if (!oai) {
    return { ok: false, error: 'web_search built-in só com OpenAI configurado' }
  }
  try {
    const resp = await oai.chat.completions.create({
      model: opts.model || 'gpt-4o-search-preview',
      max_tokens: opts.max_tokens || 800,
      messages: [
        { role: 'system', content: 'Pesquisa na web. Responda em PT-BR concisamente, com citações.' },
        { role: 'user', content: query },
      ],
    })
    const choice = resp.choices?.[0]
    const content = choice?.message?.content || ''
    const annotations = choice?.message?.annotations || []
    const citations = annotations
      .filter(a => a.type === 'url_citation' && a.url_citation)
      .map(a => ({
        title: a.url_citation.title || '',
        url: a.url_citation.url,
        snippet: a.url_citation.cited_text || '',
      }))
    return { ok: true, content, citations, model: resp.model }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * TTS — só OpenAI tem nativo. Outros providers cobertos via fallback.
 *
 * IMPORTANTE pra PT-BR: usa gpt-4o-mini-tts com `instructions` travando
 * pronúncia brasileira. Sem isso, mistura sotaque inglês/português europeu.
 */
export async function tts(opts) {
  _init()
  const oai = getOpenAIForExtras() || (_chain[0] === 'openai' ? _getClient('openai') : null)
  if (!oai) {
    throw new Error('TTS requer openai.apiKey configurado. Adicione no config.json mesmo se provider primário for outro.')
  }
  const cfg = _config
  const model = cfg.providers.openai.models?.tts || 'gpt-4o-mini-tts'
  const voice = opts.voice || cfg.voice?.voice || 'nova'

  const params = {
    model,
    voice,
    input: opts.text,
    response_format: opts.format || 'mp3',
    speed: opts.speed || cfg.voice?.speed || 1.0,
  }
  // gpt-4o-mini-tts aceita "instructions" — usa pra travar pronúncia PT-BR
  // (não usar com tts-1/tts-1-hd, eles ignoram silenciosamente)
  if (model.includes('gpt-4o-mini-tts')) {
    params.instructions = opts.instructions || cfg.voice?.instructions ||
      'Fale em português brasileiro com pronúncia natural e clara, com tom amigável e conversacional. Sotaque do Brasil (não Portugal).'
  }
  const resp = await oai.audio.speech.create(params)
  return Buffer.from(await resp.arrayBuffer())
}

/**
 * STT — só OpenAI Whisper. Recebe Buffer ou Blob.
 *
 * IMPORTANTE pra PT-BR: usa whisper-1 com `language: pt` E `prompt` curto que
 * ancora vocabulário. Sem prompt, Whisper às vezes troca PT-BR por PT-PT.
 */
export async function stt(audioBuffer, opts = {}) {
  _init()
  const oai = getOpenAIForExtras() || (_chain[0] === 'openai' ? _getClient('openai') : null)
  if (!oai) {
    throw new Error('STT requer openai.apiKey configurado')
  }
  const cfg = _config
  const model = cfg.providers.openai.models?.stt || 'whisper-1'
  const file = new File([audioBuffer], opts.filename || 'audio.webm', {
    type: opts.mimeType || 'audio/webm',
  })
  const params = {
    model,
    file,
    language: opts.language || 'pt',
    // Prompt ancora vocabulário e variante (PT-BR vs PT-PT). Whisper usa só
    // os últimos 224 tokens, então mantém curto. Ortografia BR força BR.
    prompt: opts.prompt || 'Transcrição em português brasileiro. Kerneo, abre, pesquisa, calculadora, YouTube, navegador, screenshot.',
    // temperature: 0 elimina hallucinations em áudios curtos/silêncio
    temperature: opts.temperature ?? 0,
  }
  const resp = await oai.audio.transcriptions.create(params)
  return { text: resp.text || '', model }
}

export function getProviderInfo() {
  _init()
  return {
    primary: _chain[0],
    chain: _chain,
    degraded: Array.from(_degraded.keys()).filter(_isDegraded),
    config: _config,
  }
}

/**
 * Reseta cache do LLM router (após config.json ser editado pela GUI).
 * Próxima chamada de chat() vai recarregar config + rebuildar chain.
 */
export function resetCache() {
  _config = null
  _chain = []
  _clients.clear()
  _degraded.clear()
  log.info('LLM router cache reset — recarregará config no próximo uso')
}
