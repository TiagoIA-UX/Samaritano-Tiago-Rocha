/**
 * orchestrator/index.js — Cognitive orchestrator.
 *
 * Pipeline:
 *   1. Reflex layer (regex zero-LLM) — saudações, datetime, apps óbvios
 *   2. Memory load — histórico recente + facts do user
 *   3. LLM com tool calling (gpt-4o-mini) — auto-decide tool
 *   4. Loop até resposta final (max 5 iterações)
 *   5. Persist no histórico
 *
 * Filosofia:
 *   - System prompt diferencia APP (system_app_open) vs SITE (browser_open)
 *   - Few-shot examples no system prompt pra LLM acertar de primeira
 *   - Reflex pra ações instantâneas (não desperdiça LLM call)
 *   - Erros sempre retornam mensagem amigável (nunca exception ao user)
 */

import { chat } from '../llm/openai.js'
import { chatStream } from '../llm/index.js'
import { makeLogger } from '../utils/logger.js'

const log = makeLogger('orchestrator')

const SYSTEM_PROMPT = `Você é Kerneo, assistente AI brasileiro. Conciso, direto.

REGRAS CRÍTICAS:
1. SEMPRE chame tool quando relevante. NUNCA finja "📸 vou fazer" sem chamar tool no mesmo turno.
2. Antes de skill_create, veja se já tem tool nativa que cobre. NÃO duplique.
3. Skills user-created (em user-tools/) são reais — USE em vez de recriar.
4. Não invente fatos. Use tool primeiro.

DECISÃO DE TOOL:

App desktop (calc, paint, vscode, spotify, configurações) → system_app_open
Site web (youtube, gmail, github, ifood) → browser_open
Tela do user (print/screenshot/o que tá vendo) → screen_capture
Pesquisa em site (pizza no google, X no Y) → browser_search
Pesquisa factual (preço, quem é) → web_search
Data/hora/sistema → system_info
Salvar/buscar facts → memory_op
Capacidade nova não coberta → skill_create
Listar skills → skill_list / kerneo_help
Refazer skill bugada → skill_iterate

EXEMPLOS:
"abre calculadora" → system_app_open(app="calculadora")
"abre youtube" → browser_open(url="youtube")
"que horas são" → system_info(type="datetime")
"salva meu cep" → memory_op(action="save_fact", key="cep", value="...")
"o que tem na tela" → screen_capture
"pesquisa pizza no google" → browser_search(site="google", query="pizza")

ESTILO:
- Frases curtas em PT-BR natural
- Após tool: confirma em 1 frase ("Pronto, abri X.")
- Pra capacidade nova real: oferece "posso criar skill?"
- NUNCA diga "não posso" sem antes considerar skill_create`

// Reflex patterns — zero-LLM fast paths.
// Cada pattern retorna { type: 'text', text } ou { type: 'tool', tool, args }.
const REFLEX_PATTERNS = [
  // ── Help / tutorial ──
  {
    re: /^(ajuda|help|tutorial|exemplos?|como\s+(?:te|eu)\s+us[ao]|o\s+que\s+(?:voc[êe]|tu)\s+sabe)\s*[?!.]*$/i,
    fn: () => ({ type: 'tool', tool: 'kerneo_help', args: { topic: 'all' } }),
  },
  {
    re: /^ajuda\s+(apps|sites|pesquisa|memoria|mem[oó]ria|voz|auto[-_\s]?evolu[cç][aã]o|skills)\s*[?!.]*$/i,
    fn: (m) => {
      let topic = m[1].toLowerCase().replace(/[ó]/g, 'o').replace(/[ã]/g, 'a')
      topic = topic.replace(/[-_\s]/, '-')
      if (topic === 'memoria') topic = 'memoria'
      if (topic === 'skills') topic = 'auto-evolucao'
      return { type: 'tool', tool: 'kerneo_help', args: { topic } }
    },
  },

  // ── Saudações ──
  {
    re: /^(oi|olá|ola|opa|eai|fala|salve|hey|hi|hello)\s*[!?.]*$/i,
    fn: () => ({ type: 'text', text: '👋 Oi! No que posso ajudar?' }),
  },
  {
    re: /^(bom\s*dia|boa\s*tarde|boa\s*noite)\s*[!?.]*$/i,
    fn: (m) => {
      const greet = m[1].toLowerCase().replace(/\s+/g, ' ').trim()
      return { type: 'text', text: `${greet.charAt(0).toUpperCase() + greet.slice(1)}! Manda ver, tô por aqui.` }
    },
  },
  {
    re: /^(obrigado|obrigada|valeu|thanks|thx|brigado|brigadão)\s*[!?.]*$/i,
    fn: () => ({ type: 'text', text: 'De nada! 🙌' }),
  },
  {
    re: /^(tchau|até|ate\s*mais|bye|falou)\s*[!?.]*$/i,
    fn: () => ({ type: 'text', text: 'Falou! Quando precisar, é só chamar.' }),
  },
  {
    re: /^(qual\s+seu\s+nome|seu\s+nome|quem\s+você\s+é|quem\s+e\s+voce|quem\s+você|quem\s+es)\s*[?!.]*$/i,
    fn: () => ({ type: 'text', text: 'Sou o Kerneo, seu assistente pessoal.' }),
  },

  // ── Apps nativos comuns (zero-LLM) ──
  {
    re: /^(abr[ae]|abrir|abra|open|inicia|inicie)\s+(o\s+|a\s+|os\s+|as\s+)?(calculadora|calc|calculator|bloco\s+de\s+notas|notepad|paint|wordpad|cmd|prompt(\s+de\s+comando)?|powershell|gerenciador\s+de\s+tarefas|task\s*manager|painel\s+de\s+controle|control\s+panel|configurações|configuracoes|settings|ajustes|explorer|explorador|teclado\s+virtual|gravador\s+de\s+voz|lupa|magnifier|monitor\s+de\s+recursos|editor\s+de\s+registro|regedit|terminal)\s*[!?.]*$/i,
    fn: (m) => ({
      type: 'tool',
      tool: 'system_app_open',
      args: { app: m[3].trim() },
    }),
  },

  // ── Sites óbvios ──
  {
    re: /^(abr[ae]|abrir|abra|open|vai\s+(?:pro|para\s+o)|navega\s+(?:até|para))\s+(o\s+|a\s+)?(youtube|gmail|google|github|netflix|whatsapp|discord|drive|google\s+drive|maps|google\s+maps|wikipedia|reddit|twitter|x\.com|instagram|facebook|linkedin|spotify\s*web|outlook|notion)\s*[!?.]*$/i,
    fn: (m) => ({
      type: 'tool',
      tool: 'browser_open',
      args: { url: m[3].trim().replace(/\s*web$/, '') },
    }),
  },

  // ── Screen capture fast-path ──
  {
    re: /^(?:tir[ae]\s+)?(?:um[ae]\s+)?(?:print|screenshot|captura\s+(?:de\s+)?tela|foto\s+(?:da\s+)?tela)\s*[!?.]*$/i,
    fn: () => ({ type: 'tool', tool: 'screen_capture', args: {} }),
  },
  {
    re: /^(?:o\s+que|qu[eê])\s+(?:tem|est[áa]|t[aá])\s+(?:na\s+)?(?:minha\s+)?tela\s*[?!.]*$/i,
    fn: () => ({ type: 'tool', tool: 'screen_capture', args: { question: 'O que está visível na tela? Liste programas abertos e conteúdo principal.' } }),
  },
  {
    re: /^(?:v[êe]r?|olh[ae])\s+(?:minha\s+)?tela\s*[?!.]*$/i,
    fn: () => ({ type: 'tool', tool: 'screen_capture', args: {} }),
  },

  // ── Datetime fast-path ──
  {
    re: /^(que\s+(?:horas?\s+são|hora\s+é)|que\s+horas|hora\s+atual)[?!.]*$/i,
    fn: () => ({ type: 'tool', tool: 'system_info', args: { type: 'datetime' } }),
  },
  {
    re: /^(que\s+dia\s+(?:é\s+)?hoje|qual\s+(?:o\s+)?dia\s+(?:de\s+)?hoje|data\s+(?:de\s+)?hoje)[?!.]*$/i,
    fn: () => ({ type: 'tool', tool: 'system_info', args: { type: 'datetime' } }),
  },
]

export class Orchestrator {
  constructor({ toolRegistry, memoryStore, opts = {} }) {
    this.toolRegistry = toolRegistry
    this.memory = memoryStore
    this.maxIterations = opts.maxIterations || 5
    this.model = opts.model || 'fast'
  }

  /** Tenta reflex. Retorna { type, ... } ou null. */
  tryReflex(input) {
    const trimmed = input.trim()
    for (const p of REFLEX_PATTERNS) {
      const m = trimmed.match(p.re)
      if (m) return p.fn(m)
    }
    return null
  }

  buildContext(sessionId, userInput) {
    const messages = []
    // Reduzido pra 5 facts (de 10) — economia de ~150-300 tokens/call
    const facts = this.memory.listFacts(5)
    if (facts.length > 0) {
      const factsText = facts.map(f => `${f.key}: ${f.value}`).join('\n')
      messages.push({
        role: 'system',
        content: `Fatos persistentes do user:\n${factsText}`,
      })
    }
    // Reduzido pra 4 turnos (de 6) — economia de ~200-400 tokens/call
    const history = this.memory.recentHistory(sessionId, 4)
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content })
    }
    messages.push({ role: 'user', content: userInput })
    return messages
  }

  /**
   * First-run wizard — detecta sessão nova (sem histórico no DB) e adiciona
   * mensagem de boas-vindas com onboarding curto. Só dispara na PRIMEIRA query
   * de cada sessão fresh.
   */
  isFirstRun(sessionId) {
    const history = this.memory.recentHistory(sessionId, 1)
    return history.length === 0
  }

  /**
   * Self-improvement loop — analisa resposta e detecta "não posso" pra sugerir
   * skill_create. PORÉM, só sugere se REALMENTE não há tool/skill que cobre.
   *
   * NÃO sugere quando:
   *   - Tool foi chamada com sucesso (já fez)
   *   - skill_create / kerneo_help foi usada (já tá no caminho)
   *   - Há tool nativa OU user-tool com nome "similar" à query
   *   - User pedido "tira print/screenshot/tela" (temos screen_capture nativa)
   */
  shouldSuggestSkillCreate(userInput, finalText, toolCalls) {
    // Já chamou skill_create / help? não duplica
    if (toolCalls.some(t => t.name === 'skill_create' || t.name === 'kerneo_help' || t.name === 'skill_iterate')) return false
    // Tools chamadas e OK? significa que foi resolvido
    if (toolCalls.length > 0 && toolCalls.every(t => t.output?.ok !== false)) return false

    const text = (finalText || '').toLowerCase()
    const input = (userInput || '').toLowerCase()

    // Detecta intent de "não posso"
    const cantPatterns = [
      /n[aã]o\s+(?:posso|consigo|tenho)\s+(?:fazer|acessar|controlar|abrir|ajudar|ver|tirar)/,
      /n[aã]o\s+(?:est[aá]\s+)?(?:dispon[íi]vel|implementad[ao])/,
      /(?:essa|esta|isso)\s+(?:n[aã]o|n[aã]o\s+)?(?:[ée]\s+)?poss[íi]vel/,
      /n[aã]o\s+sou\s+capaz/,
      /minha\s+fun[cç][aã]o\s+[ée]\s+apenas/,
      /n[aã]o\s+(?:tenho|possuo)\s+(?:essa|a)\s+capacidade/,
      /n[aã]o\s+(?:fa[cç]o|fa[çc]o)\s+isso/,
      /n[aã]o\s+(?:consigo|posso)\s+(?:ver|escutar|ouvir|interagir)/,
    ]
    if (!cantPatterns.some(re => re.test(text))) return false

    // Tem tool/skill que provavelmente resolve? então não sugere criar
    const allTools = this.toolRegistry.list().map(t => t.name)
    const inputKeywords = input.match(/\w+/g) || []
    const hasMatchingTool = allTools.some(toolName => {
      // Match básico: tool name contém keyword do input OU vice-versa
      const lcTool = toolName.toLowerCase()
      return inputKeywords.some(kw => kw.length >= 4 && (lcTool.includes(kw) || kw.includes(lcTool.split('_')[0])))
    })
    if (hasMatchingTool) return false

    // Specific intent → tool nativa cobre
    const intentToToolMap = [
      { re: /tela|screenshot|print|captura/, tool: 'screen_capture' },
      { re: /horas?|dia\s+(?:de\s+)?hoje|data/, tool: 'system_info' },
      { re: /salv[ae]r|lembr[ae]r|memori[ae]/, tool: 'memory_op' },
      { re: /abr[ae]r|abre/, tool: 'system_app_open OR browser_open' },
      { re: /pesquis|busc/, tool: 'web_search OR browser_search' },
    ]
    for (const m of intentToToolMap) {
      if (m.re.test(input)) {
        log.debug(`self-improve skip: input "${input.slice(0,30)}" tem tool nativa ${m.tool}`)
        return false
      }
    }

    return true
  }

  /**
   * Streaming version — yields eventos SSE conforme tokens chegam.
   *
   * Eventos emitidos:
   *   { type: 'reflex', text, from_reflex: true, tool_calls: [...] }   → resposta instantânea
   *   { type: 'text', content: 'tokens...' }                            → token streaming
   *   { type: 'tool_call_start', name, args }                           → tool executando
   *   { type: 'tool_call_end', name, output }                           → tool completou
   *   { type: 'meta', iteration, dt_ms }
   *   { type: 'done', text_total, tool_calls, dt_ms }
   *   { type: 'error', message }
   */
  async *handleRequestStream({ sessionId, userInput, signal }) {
    const t0 = Date.now()
    const isFirst = this.isFirstRun(sessionId)

    // 1. Reflex layer
    const reflex = this.tryReflex(userInput)
    if (reflex) {
      if (reflex.type === 'text') {
        this.memory.addHistory(sessionId, 'user', userInput)
        this.memory.addHistory(sessionId, 'assistant', reflex.text)
        this.memory.setSessionState(sessionId, { userInput, response: reflex.text })
        yield { type: 'reflex', text: reflex.text, tool_calls: [], dt_ms: Date.now() - t0 }
        yield { type: 'done', text: reflex.text, tool_calls: [], from_reflex: true, dt_ms: Date.now() - t0 }
        return
      }
      if (reflex.type === 'tool') {
        const tool = this.toolRegistry.get(reflex.tool)
        if (tool) {
          yield { type: 'tool_call_start', name: reflex.tool, args: reflex.args || {} }
          try {
            const output = await tool.execute(reflex.args || {})
            const text = output?.message || (output?.ok === false ? `Não consegui: ${output.error}` : 'Pronto.')
            yield { type: 'tool_call_end', name: reflex.tool, output }
            this.memory.addHistory(sessionId, 'user', userInput)
            this.memory.addHistory(sessionId, 'assistant', text)
            this.memory.setSessionState(sessionId, { userInput, response: text })
            yield { type: 'text', content: text }
            yield { type: 'done', text, tool_calls: [{ name: reflex.tool, args: reflex.args, output }], from_reflex: true, dt_ms: Date.now() - t0 }
            return
          } catch (err) {
            yield { type: 'error', message: `Reflex tool falhou: ${err.message}` }
            // Cai pro LLM normal abaixo
          }
        }
      }
    }

    // 2. Build context
    const messages = this.buildContext(sessionId, userInput)
    const tools = this.toolRegistry.toOpenAITools()

    const allToolCalls = []
    let iter = 0
    let finalText = ''
    let textSoFar = ''

    while (iter < this.maxIterations) {
      iter++
      yield { type: 'meta', iteration: iter, dt_ms: Date.now() - t0 }

      let collectedText = ''
      let collectedToolCalls = []

      try {
        for await (const event of chatStream({
          model: this.model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          max_tokens: 1024,
          temperature: 0.3,
          signal,
        })) {
          if (event.type === 'text') {
            collectedText += event.content
            textSoFar += event.content
            yield { type: 'text', content: event.content }
          } else if (event.type === 'tool_calls') {
            collectedToolCalls = event.tool_calls
          } else if (event.type === 'done') {
            // chunk stream concluído pra essa iteration
          }
        }
      } catch (err) {
        log.error('LLM stream falhou', { iter, err: err.message })
        const errMsg = 'Tive um problema pra processar agora. Tenta de novo.'
        yield { type: 'text', content: errMsg }
        finalText = errMsg
        break
      }

      // Sem tool_calls? acabou
      if (collectedToolCalls.length === 0) {
        finalText = collectedText
        break
      }

      // Tools chamadas — adiciona msg assistant + executa tools em paralelo
      messages.push({
        role: 'assistant',
        content: collectedText || null,
        tool_calls: collectedToolCalls,
      })

      log.info(`stream iter ${iter}: ${collectedToolCalls.length} tool call(s)`, {
        tools: collectedToolCalls.map(tc => tc.function?.name).join(','),
      })

      // Loop sequencial — yield dentro de generator precisa rodar no escopo
      // direto da async function*, não em callbacks de map/Promise.all.
      for (const tc of collectedToolCalls) {
        const name = tc.function?.name
        let args
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch { args = {} }
        yield { type: 'tool_call_start', name, args }
        const tool = this.toolRegistry.get(name)
        if (!tool) {
          const errOut = { ok: false, error: `tool not found: ${name}` }
          allToolCalls.push({ name, args, output: errOut })
          yield { type: 'tool_call_end', name, output: errOut }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(errOut).slice(0, 4000) })
          continue
        }
        try {
          const out = await tool.execute(args)
          allToolCalls.push({ name, args, output: out })
          yield { type: 'tool_call_end', name, output: out }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 4000) })
        } catch (err) {
          const errOut = { ok: false, error: err.message }
          allToolCalls.push({ name, args, output: errOut })
          yield { type: 'tool_call_end', name, output: errOut }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(errOut).slice(0, 4000) })
        }
      }

      // Continua loop pro LLM responder com base nos tool results
    }

    if (!finalText) finalText = textSoFar || 'Tive um loop nas tools — tenta reformular.'

    // Self-improvement loop
    if (this.shouldSuggestSkillCreate(userInput, finalText, allToolCalls)) {
      const hint = '\n\n💡 Posso CRIAR uma skill nova pra fazer isso. Diga: "cria uma skill que [descrição]".'
      yield { type: 'text', content: hint }
      finalText += hint
    }
    const failedUserSkill = allToolCalls.find(t => {
      if (!t.output || t.output.ok !== false) return false
      const entry = this.toolRegistry.get(t.name)
      return entry?.filePath?.includes('user-tools')
    })
    if (failedUserSkill) {
      const hint = `\n\n🔄 A skill "${failedUserSkill.name}" falhou. Diga "refaz a skill ${failedUserSkill.name}".`
      yield { type: 'text', content: hint }
      finalText += hint
    }
    if (isFirst && !reflex && allToolCalls.length === 0) {
      const hint = '\n\n🎉 Diga "ajuda" pra ver o que sei fazer.'
      yield { type: 'text', content: hint }
      finalText += hint
    }

    // Persist
    this.memory.addHistory(sessionId, 'user', userInput)
    this.memory.addHistory(sessionId, 'assistant', finalText)
    this.memory.setSessionState(sessionId, {
      userInput, response: finalText,
      plan: { tool_calls: allToolCalls.map(t => ({ name: t.name, args: t.args })) },
    })

    yield {
      type: 'done',
      text: finalText,
      tool_calls: allToolCalls,
      iterations: iter,
      dt_ms: Date.now() - t0,
    }
  }

  async handleRequest({ sessionId, userInput, signal }) {
    const t0 = Date.now()
    const isFirst = this.isFirstRun(sessionId)

    // 1. Reflex layer
    const reflex = this.tryReflex(userInput)
    if (reflex) {
      // Reflex texto direto
      if (reflex.type === 'text') {
        this.memory.addHistory(sessionId, 'user', userInput)
        this.memory.addHistory(sessionId, 'assistant', reflex.text)
        this.memory.setSessionState(sessionId, { userInput, response: reflex.text })
        log.info('reflex hit (text)', { input: userInput.slice(0, 30), dt_ms: Date.now() - t0 })
        return { text: reflex.text, tool_calls: [], from_reflex: true, duration_ms: Date.now() - t0 }
      }

      // Reflex tool call — executa tool direto
      if (reflex.type === 'tool') {
        const tool = this.toolRegistry.get(reflex.tool)
        if (tool) {
          try {
            const output = await tool.execute(reflex.args || {})
            const text = output?.message || (output?.ok === false
              ? `Não consegui: ${output.error}`
              : 'Pronto.')
            this.memory.addHistory(sessionId, 'user', userInput)
            this.memory.addHistory(sessionId, 'assistant', text)
            this.memory.setSessionState(sessionId, { userInput, response: text })
            log.info('reflex hit (tool)', {
              input: userInput.slice(0, 30),
              tool: reflex.tool,
              ok: output?.ok !== false,
              dt_ms: Date.now() - t0,
            })
            return {
              text,
              tool_calls: [{ name: reflex.tool, args: reflex.args, output }],
              from_reflex: true,
              duration_ms: Date.now() - t0,
            }
          } catch (err) {
            log.warn('reflex tool falhou', { tool: reflex.tool, err: err.message })
            // Cai pro LLM normal
          }
        }
      }
    }

    // 2. Build context
    const messages = this.buildContext(sessionId, userInput)
    const tools = this.toolRegistry.toOpenAITools()
    log.debug('context built', { messages: messages.length, tools: tools.length })

    // 3. Tool calling loop
    const allToolCalls = []
    let iter = 0
    let finalText = ''

    while (iter < this.maxIterations) {
      iter++
      let resp
      try {
        resp = await chat({
          model: this.model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          max_tokens: 1024,
          temperature: 0.3,
          signal,
        })
      } catch (err) {
        log.error('LLM call falhou', { iter, err: err.message })
        finalText = 'Tive um problema pra processar agora. Tenta de novo.'
        break
      }

      if (!resp.tool_calls || resp.tool_calls.length === 0) {
        finalText = resp.content || '(sem resposta)'
        break
      }

      log.info(`iter ${iter}: ${resp.tool_calls.length} tool call(s)`, {
        tools: resp.tool_calls.map(tc => tc.function?.name).join(','),
      })
      messages.push({ role: 'assistant', content: resp.content || null, tool_calls: resp.tool_calls })

      const results = await Promise.all(resp.tool_calls.map(async (tc) => {
        const name = tc.function?.name
        let args
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch { args = {} }
        const tool = this.toolRegistry.get(name)
        if (!tool) {
          return { tc_id: tc.id, name, output: { ok: false, error: `tool not found: ${name}` } }
        }
        try {
          const out = await tool.execute(args)
          allToolCalls.push({ name, args, output: out })
          return { tc_id: tc.id, name, output: out }
        } catch (err) {
          const errOut = { ok: false, error: err.message }
          allToolCalls.push({ name, args, output: errOut })
          return { tc_id: tc.id, name, output: errOut }
        }
      }))

      for (const r of results) {
        messages.push({
          role: 'tool',
          tool_call_id: r.tc_id,
          content: JSON.stringify(r.output).slice(0, 4000),
        })
      }
    }

    if (!finalText) finalText = 'Tive um loop nas tools — tenta reformular.'

    // 4. Self-improvement loop — sugere criar skill se LLM disse "não posso"
    if (this.shouldSuggestSkillCreate(userInput, finalText, allToolCalls)) {
      finalText += '\n\n💡 Posso CRIAR uma skill nova pra fazer isso. Diga: "cria uma skill que [descrição]" e eu gero o código na hora.'
      log.info('self-improvement hint added')
    }

    // 4b. Detect skill_create OU skill user-created que falhou — sugere iterate
    const failedUserSkill = allToolCalls.find(t => {
      if (!t.output || t.output.ok !== false) return false
      // Era skill criada pelo user? checa entry no registry
      const entry = this.toolRegistry.get(t.name)
      return entry?.filePath?.includes('user-tools')
    })
    if (failedUserSkill) {
      const errMsg = failedUserSkill.output?.error || 'erro desconhecido'
      finalText += `\n\n🔄 A skill "${failedUserSkill.name}" falhou (${String(errMsg).slice(0, 80)}). ` +
                   `Posso REFAZER ela melhor — diga: "refaz a skill ${failedUserSkill.name}".`
      log.info('skill-iterate hint added', { skill: failedUserSkill.name })
    }

    // 5. First-run wizard — anexa onboarding na 1ª mensagem da sessão
    if (isFirst && !reflex && allToolCalls.length === 0) {
      finalText += '\n\n🎉 Primeira vez aqui? Diga "ajuda" pra ver o que sei fazer (incluindo CRIAR novas skills sob demanda).'
    }

    // 6. Persist
    this.memory.addHistory(sessionId, 'user', userInput)
    this.memory.addHistory(sessionId, 'assistant', finalText)
    this.memory.setSessionState(sessionId, {
      userInput,
      response: finalText,
      plan: { tool_calls: allToolCalls.map(t => ({ name: t.name, args: t.args })) },
    })

    const dt = Date.now() - t0
    log.info('done', { input: userInput.slice(0, 30), dt_ms: dt, tools: allToolCalls.length, iters: iter })

    return {
      text: finalText,
      tool_calls: allToolCalls,
      iterations: iter,
      duration_ms: dt,
    }
  }
}
