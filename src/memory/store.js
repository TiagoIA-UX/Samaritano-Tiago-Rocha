/**
 * memory/store.js — Memória persistente em SQLite.
 *
 * 3 tabelas simples:
 *   - facts: key/value de fatos sobre o user (cep, nome, preferências)
 *   - history: histórico de turnos chat (last 1000)
 *   - sessions: estado por sessão (last_plan, last_response — pra "tenta novamente")
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { makeLogger } from '../utils/logger.js'

const log = makeLogger('memory')

export class MemoryStore {
  constructor(dataDir) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    const dbPath = path.join(dataDir, 'kerneo.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this._init()
    log.info('memória iniciada', { db: dbPath })
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,           -- 'user' | 'assistant'
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_session ON history(session_id, created_at);

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        last_user_input TEXT,
        last_response TEXT,
        last_plan TEXT,                -- JSON
        updated_at INTEGER NOT NULL
      );
    `)
  }

  // ── Facts ──────────────────────────────────────────────────────
  saveFact(key, value, opts = {}) {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO facts (key, value, category, created_at, updated_at)
      VALUES (@key, @value, @category, @now, @now)
      ON CONFLICT(key) DO UPDATE SET
        value=@value, category=@category, updated_at=@now
    `).run({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      category: opts.category || null,
      now,
    })
    return { key, value }
  }

  getFact(key) {
    const row = this.db.prepare('SELECT * FROM facts WHERE key = ?').get(key)
    if (!row) return null
    return { key: row.key, value: row.value, category: row.category }
  }

  listFacts(limit = 50) {
    return this.db.prepare('SELECT * FROM facts ORDER BY updated_at DESC LIMIT ?').all(limit)
  }

  searchFacts(query, limit = 10) {
    const q = `%${query.toLowerCase()}%`
    return this.db.prepare(`
      SELECT * FROM facts
      WHERE LOWER(key) LIKE ? OR LOWER(value) LIKE ?
      ORDER BY updated_at DESC LIMIT ?
    `).all(q, q, limit)
  }

  // ── History ────────────────────────────────────────────────────
  addHistory(sessionId, role, content) {
    this.db.prepare(`
      INSERT INTO history (session_id, role, content, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, role, content, Date.now())
  }

  recentHistory(sessionId, limit = 10) {
    const rows = this.db.prepare(`
      SELECT role, content FROM history
      WHERE session_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(sessionId, limit)
    return rows.reverse() // chronological
  }

  // ── Sessions ───────────────────────────────────────────────────
  setSessionState(sessionId, state) {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO sessions (session_id, last_user_input, last_response, last_plan, updated_at)
      VALUES (@session_id, @user_input, @response, @plan, @now)
      ON CONFLICT(session_id) DO UPDATE SET
        last_user_input=@user_input,
        last_response=@response,
        last_plan=@plan,
        updated_at=@now
    `).run({
      session_id: sessionId,
      user_input: state.userInput || null,
      response: state.response || null,
      plan: state.plan ? JSON.stringify(state.plan) : null,
      now,
    })
  }

  getSessionState(sessionId) {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId)
    if (!row) return null
    return {
      session_id: row.session_id,
      last_user_input: row.last_user_input,
      last_response: row.last_response,
      last_plan: row.last_plan ? JSON.parse(row.last_plan) : null,
    }
  }

  close() {
    try { this.db.close() } catch {}
  }
}
