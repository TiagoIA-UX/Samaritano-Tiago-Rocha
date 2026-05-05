/**
 * registry.js — Auto-discovery de tools + hot-reload.
 *
 * Drop um arquivo em src/tools/ exportando { definition, execute } e ele
 * aparece automaticamente. Sem registro manual.
 *
 * HOT-RELOAD (Sprint v0.3): após `skill_create` salvar nova tool, chamamos
 * `registry.loadOne(filename)` pra carregar SEM restart. Cache-bust via
 * timestamp na URL do import.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { makeLogger } from '../utils/logger.js'

const log = makeLogger('tools')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class ToolRegistry {
  constructor() {
    this.tools = new Map()
    this.toolsDir = __dirname
  }

  async discover(dir = this.toolsDir) {
    // 1. Tools nativas (raiz)
    const files = fs.readdirSync(dir).filter(f =>
      f.endsWith('.js') &&
      !f.startsWith('_') &&
      f !== 'registry.js'
    )
    for (const file of files) {
      await this._loadFile(path.join(dir, file))
    }

    // 2. Tools criadas pelo user (user-tools/)
    const userDir = path.join(dir, 'user-tools')
    if (fs.existsSync(userDir)) {
      const userFiles = fs.readdirSync(userDir).filter(f => f.endsWith('.js'))
      let userCount = 0
      for (const file of userFiles) {
        const name = await this._loadFile(path.join(userDir, file))
        if (name) userCount++
      }
      if (userCount > 0) log.info(`user-created tools loaded: ${userCount}`)
    }

    log.info(`total tools: ${this.tools.size}`)
  }

  async _loadFile(fullPath, cacheBust = false) {
    try {
      const url = pathToFileURL(fullPath).href + (cacheBust ? `?t=${Date.now()}` : '')
      const mod = await import(url)
      if (mod.definition && mod.execute) {
        this.tools.set(mod.definition.name, {
          definition: mod.definition,
          execute: mod.execute,
          module: mod,
          filePath: fullPath,
        })
        log.debug(`registered: ${mod.definition.name}`)
        return mod.definition.name
      }
    } catch (err) {
      log.warn(`failed to load ${path.basename(fullPath)}: ${err.message}`)
    }
    return null
  }

  /**
   * Hot-load uma tool específica (após skill_create salvar arquivo novo).
   * Cache-bust via timestamp pra ESM re-importar.
   */
  async loadOne(filename) {
    const fullPath = path.isAbsolute(filename)
      ? filename
      : path.join(this.toolsDir, filename)
    if (!fs.existsSync(fullPath)) return null
    return await this._loadFile(fullPath, true)
  }

  /**
   * Remove tool do registry e do disco.
   */
  async unload(name) {
    const entry = this.tools.get(name)
    if (!entry) return false
    this.tools.delete(name)
    return true
  }

  /**
   * Remove tool do registry E deleta arquivo do disco.
   */
  async remove(name) {
    const entry = this.tools.get(name)
    if (!entry) return false
    try {
      if (fs.existsSync(entry.filePath)) {
        fs.unlinkSync(entry.filePath)
      }
    } catch (err) {
      log.warn(`falha ao remover ${entry.filePath}: ${err.message}`)
      return false
    }
    this.tools.delete(name)
    return true
  }

  get(name) {
    return this.tools.get(name)
  }

  list() {
    return Array.from(this.tools.values()).map(t => t.definition)
  }

  /** Lista metadata completa (incluindo filePath, pra skill_list) */
  listFull() {
    return Array.from(this.tools.values()).map(t => ({
      ...t.definition,
      filePath: t.filePath,
      isUserCreated: t.filePath?.includes('user-tools') || false,
    }))
  }

  toOpenAITools() {
    return this.list().map(def => ({
      type: 'function',
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters || def.input_schema || { type: 'object', properties: {} },
      },
    }))
  }

  /** Pra skill_create — diretório onde tools custom são salvas */
  getUserToolsDir() {
    const dir = path.join(this.toolsDir, 'user-tools')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  }
}
