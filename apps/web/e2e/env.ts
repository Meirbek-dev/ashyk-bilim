import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Cross-spec state (course / activity ids) lives in `process.env` AND in
 * `e2e/.auth/state.json`: Playwright restarts the worker after a failure,
 * which would otherwise drop every id the earlier specs captured.
 */
const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth', 'state.json')

const readState = (): Record<string, string> => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

export const getEnv = (key: string): string | undefined => process.env[key] ?? readState()[key]

export const getEnvOr = (key: string, fallback: string): string => getEnv(key) ?? fallback

export const requireEnv = (key: string): string => {
  const value = getEnv(key)
  if (value === undefined) {
    throw new Error(`[e2e] Missing required environment variable: ${key}`)
  }
  return value
}

export const setEnv = (key: string, value: string): string => {
  process.env[key] = value
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), [key]: value }, null, 2))
  return value
}
