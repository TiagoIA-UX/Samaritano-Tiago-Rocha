/**
 * logger.js — logger minimal sem dependências externas.
 *
 * Níveis: error | warn | info | debug (controle via LOG_LEVEL env).
 * Output: console com prefixo + timestamp + categoria.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const CURRENT = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info

function ts() {
  const d = new Date()
  return d.toTimeString().slice(0, 8)
}

function fmt(level, category, msg, extra) {
  const head = `[${ts()}] ${level.toUpperCase().padEnd(5)} [${category}]`
  if (extra && Object.keys(extra).length > 0) {
    const extraStr = Object.entries(extra)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ')
    return `${head} ${msg} ${extraStr}`
  }
  return `${head} ${msg}`
}

export function makeLogger(category) {
  return {
    error: (msg, extra) => CURRENT >= LEVELS.error && console.error(fmt('error', category, msg, extra)),
    warn:  (msg, extra) => CURRENT >= LEVELS.warn  && console.warn(fmt('warn',  category, msg, extra)),
    info:  (msg, extra) => CURRENT >= LEVELS.info  && console.log(fmt('info',  category, msg, extra)),
    debug: (msg, extra) => CURRENT >= LEVELS.debug && console.log(fmt('debug', category, msg, extra)),
  }
}

export const logger = makeLogger('kerneo')
