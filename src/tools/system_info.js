/**
 * system_info.js — Info básica do sistema (data, hora, OS, CPU/RAM).
 *
 * Sem dependências externas — info via os/process built-in Node.
 */

import os from 'os'

export const definition = {
  name: 'system_info',
  description: 'Retorna data/hora atual, OS, uso de CPU/RAM. Use pra "que horas são", "que dia é hoje", "uso de memória".',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['datetime', 'os', 'memory', 'cpu', 'all'],
        default: 'all',
      },
    },
  },
}

function fmtBytes(b) {
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`
  if (b > 1e6) return `${(b / 1e6).toFixed(2)} MB`
  return `${(b / 1e3).toFixed(2)} KB`
}

export async function execute({ type = 'all' } = {}) {
  const now = new Date()
  const result = {}

  if (type === 'datetime' || type === 'all') {
    result.datetime = {
      iso: now.toISOString(),
      date: now.toLocaleDateString('pt-BR'),
      time: now.toLocaleTimeString('pt-BR'),
      day_of_week: now.toLocaleDateString('pt-BR', { weekday: 'long' }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }
  if (type === 'os' || type === 'all') {
    result.os = {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime_hours: Math.round(os.uptime() / 3600),
    }
  }
  if (type === 'memory' || type === 'all') {
    const total = os.totalmem()
    const free = os.freemem()
    result.memory = {
      total: fmtBytes(total),
      free: fmtBytes(free),
      used_pct: Math.round((1 - free / total) * 100),
    }
  }
  if (type === 'cpu' || type === 'all') {
    const cpus = os.cpus()
    result.cpu = {
      model: cpus[0]?.model?.trim() || 'unknown',
      cores: cpus.length,
      load_avg: os.loadavg().map(n => Number(n.toFixed(2))),
    }
  }

  return {
    ok: true,
    ...result,
    summary: type === 'datetime' || type === 'all'
      ? `📅 ${result.datetime.day_of_week}, ${result.datetime.date} · 🕐 ${result.datetime.time}`
      : 'Info de sistema',
  }
}
