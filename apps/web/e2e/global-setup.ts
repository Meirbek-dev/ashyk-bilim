/**
 * Global setup — runs once before the entire Playwright test suite.
 *
 * Responsibilities (v2 contract, `/api/v2`):
 *  1. Verify the Admin, Teacher and Student accounts can log in through the
 *     BFF (`POST /auth/login`). v2 has no registration endpoint — the three
 *     accounts must exist beforehand (seeded through Zitadel + the ETL /
 *     rehearsal stack, see docs/rewrite/EXECUTION-PLAN.md 9.4).
 *  2. Log in as Admin and grant the teacher role
 *     (`POST /users/{id}/roles {role: slug}`) to the Teacher user, resolved
 *     through the admin listing (`GET /users?q=`).
 *  3. Persist authenticated browser storage states (the `ab_session` cookie)
 *     for Admin, Teacher, and Student so individual test files can reuse them
 *     without re-logging-in for every single spec.
 *
 * Design decisions:
 *  - Direct REST calls for the administrative steps — faster and more
 *    reliable than browser interactions.
 *  - A real browser session is used only to capture the storageState, which
 *    the server action sets via an HttpOnly cookie on the app origin.
 */

import { chromium } from '@playwright/test'
import type { FullConfig } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORAGE_STATE_DIR, STORAGE_STATE } from './auth-states'
import { getEnvOr, requireEnv } from './env'

export { STORAGE_STATE_DIR, STORAGE_STATE }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Load test-specific env overrides (Playwright runs in Node; dotenv may not be
// available as a dep, so we do a minimal manual parse as a fallback).
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(path.join(__dirname, '.env.test.local')) // overrides win: first loader sets the key
loadEnvFile(path.join(__dirname, '.env.test'))

const API_URL = getEnvOr('E2E_API_URL', 'http://localhost:8080/api/v2').replace(/\/+$/u, '')
const BASE_URL = getEnvOr('E2E_BASE_URL', 'http://localhost:3000')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Problem {
  code?: string
  detail?: string
  title?: string
}

async function readProblem(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as Problem | null
  return body ? `${body.code ?? ''} ${body.detail ?? body.title ?? ''}`.trim() : ''
}

/** POST /auth/login (JSON) — returns the `ab_session` cookie pair. */
async function loginViaApi(login: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
    redirect: 'manual',
  })

  if (!res.ok) {
    throw new Error(`[setup] Login failed for ${login}: ${res.status} ${await readProblem(res)}`)
  }

  const setCookie = res.headers.getSetCookie?.() ?? []
  const session = setCookie.map(c => c.split(';')[0]).find(pair => pair?.startsWith('ab_session='))
  if (!session) {
    throw new Error(`[setup] Login for ${login} returned no ab_session cookie.`)
  }
  return session
}

/** GET /auth/session — the caller's user id, roles and permissions. */
async function getSessionInfo(cookieHeader: string): Promise<{ user_id: string; roles: string[] }> {
  const res = await fetch(`${API_URL}/auth/session`, { headers: { Cookie: cookieHeader } })
  if (!res.ok) throw new Error(`[setup] /auth/session failed: ${res.status}`)
  return res.json() as Promise<{ user_id: string; roles: string[] }>
}

/** POST /users/{id}/roles {role} — idempotent role grant (platform admin). */
async function assignRole(adminCookie: string, userId: string, roleSlug: string): Promise<void> {
  const res = await fetch(`${API_URL}/users/${userId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ role: roleSlug }),
  })
  // 409 = already holds the role; anything else non-2xx is a real failure.
  if (!res.ok && res.status !== 409) {
    throw new Error(`[setup] Failed to assign role ${roleSlug} to ${userId}: ${res.status} ${await readProblem(res)}`)
  }
}

/** Log in through the UI and persist the browser storage state. */
async function captureStorageState(login: string, password: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()

  await page.goto('/en/login')

  await page.locator('input[name="login"]').fill(login)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()

  // Wait for redirect away from /login — indicates successful auth
  await page.waitForURL(url => !url.pathname.includes('/login'), {
    timeout: 15_000,
  })

  await context.storageState({ path: outputPath })
  await browser.close()
  console.log(`[setup] Saved storage state for ${login} → ${outputPath}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Ensure output directory exists; drop cross-spec state left by an aborted run
  fs.mkdirSync(STORAGE_STATE_DIR, { recursive: true })
  fs.rmSync(path.join(STORAGE_STATE_DIR, 'state.json'), { force: true })

  const teacherEmail = requireEnv('E2E_TEACHER_EMAIL')
  const teacherPassword = requireEnv('E2E_TEACHER_PASSWORD')
  const studentEmail = requireEnv('E2E_STUDENT_EMAIL')
  const studentPassword = requireEnv('E2E_STUDENT_PASSWORD')
  const adminEmail = requireEnv('E2E_ADMIN_EMAIL')
  const adminPassword = requireEnv('E2E_ADMIN_PASSWORD')

  // 1. Every account must already exist — v2 has no registration endpoint.
  const adminCookie = await loginViaApi(adminEmail, adminPassword)
  const teacherCookie = await loginViaApi(teacherEmail, teacherPassword)
  await loginViaApi(studentEmail, studentPassword)

  // 2. Grant the teacher role (configurable via E2E_TEACHER_ROLE_SLUG, default: 'instructor')
  const teacherRoleSlug = getEnvOr('E2E_TEACHER_ROLE_SLUG', 'instructor')
  const teacher = await getSessionInfo(teacherCookie)
  if (!teacher.roles.includes(teacherRoleSlug)) {
    await assignRole(adminCookie, teacher.user_id, teacherRoleSlug)
    console.log(`[setup] Assigned role "${teacherRoleSlug}" to ${teacherEmail} (id=${teacher.user_id})`)
  }

  // 3. Capture real browser storage states (HttpOnly cookies)
  await captureStorageState(adminEmail, adminPassword, STORAGE_STATE.admin)
  await captureStorageState(teacherEmail, teacherPassword, STORAGE_STATE.teacher)
  await captureStorageState(studentEmail, studentPassword, STORAGE_STATE.student)

  console.log('[setup] Global setup complete.')
}
