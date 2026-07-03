/**
 * Carrega variáveis de ambiente na ordem:
 *   1. .env (opcional, compartilhável)
 *   2. .env.local (segredos locais — sobrescreve .env)
 */
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const root = process.cwd()

dotenv.config({ path: path.join(root, '.env') })

const localPath = path.join(root, '.env.local')
if (fs.existsSync(localPath)) {
  dotenv.config({ path: localPath, override: true })
}
