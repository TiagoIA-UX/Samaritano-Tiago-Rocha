/**
 * llm/openai.js — Re-export do router universal (compatibilidade com código antigo).
 *
 * Use src/llm/index.js diretamente em código novo.
 */

export { chat, complete, vision, webSearch, tts, stt, getProviderInfo } from './index.js'
