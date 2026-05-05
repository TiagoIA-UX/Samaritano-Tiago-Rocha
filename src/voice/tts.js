/**
 * voice/tts.js — TTS streaming via OpenAI gpt-4o-mini-tts.
 *
 * Uso típico:
 *   const stream = await ttsStream({ text: 'Olá!' })
 *   stream.pipe(res)  // Express/Node http
 *
 * Latência: first byte ~300-500ms (streaming). Voice "nova" tem qualidade
 * natural em PT-BR. Override via env OPENAI_VOICE.
 */

import { tts as openaiTts } from '../llm/openai.js'

/**
 * Stream MP3 com áudio TTS. Retorna ReadableStream pronto pra pipe.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.voice='nova']
 * @param {number} [opts.speed=1.0]
 * @returns {Promise<ReadableStream>}
 */
export async function ttsStream(opts) {
  if (!opts?.text || typeof opts.text !== 'string') {
    throw new Error('text obrigatório')
  }
  // Trunca pra evitar custo absurdo se LLM gerar paragrafo gigante
  const text = opts.text.slice(0, 4000)
  return await openaiTts({
    text,
    voice: opts.voice,
    format: 'mp3',
    speed: opts.speed,
  })
}
