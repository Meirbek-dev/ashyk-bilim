/**
 * Global setup — runs once before the entire Playwright test suite.
 *
 * Responsibilities:
 *  1. Register the Teacher and Student accounts via the public API.
 *  2. Log in as Admin, grant the "Teacher" role to the Teacher user via API.
 *  3. Persist authenticated browser storage states (cookies + localStorage)
 *     for Admin, Teacher, and Student so individual test files can reuse them
 *     without re-logging-in for every single spec.
 *
 * Design decisions:
 *  - We use direct REST API calls (via fetch) for user creation / role
 *    assignment. This is faster and more reliable than browser interactions
 *    for purely administrative tasks.
 *  - A real browser session is used only to capture the storageState, which
 *    Next.js sets via HttpOnly cookies that fetch() can't obtain.
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

loadEnvFile(path.join(__dirname, '.env.test'))
loadEnvFile(path.join(__dirname, '.env.test.local')) // overrides

const API_URL = getEnvOr('E2E_API_URL', 'http://localhost:1338/api/v1')
const BASE_URL = getEnvOr('E2E_BASE_URL', 'http://localhost:3000')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST /api/v1/auth/register  (FastAPI-Users standard endpoint) */
async function registerUser(opts: {
  email: string
  password: string
  firstName: string
  lastName: string
}): Promise<{ id: number; email: string } | null> {
  // Derive a username from the email local-part (e.g. e2e-teacher@example.com → e2e_teacher)
  const usernameSource = opts.email.split('@')[0] ?? opts.email
  const username = usernameSource.replace(/[^a-zA-Z0-9_]/g, '_')
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: opts.email,
      password: opts.password,
      username,
      first_name: opts.firstName,
      last_name: opts.lastName,
      is_active: true,
    }),
  })

  if (res.status === 400) {
    // Handle "already exists" responses — both FastAPI-Users and platform-custom formats
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const alreadyExists =
      body.detail === 'REGISTER_USER_ALREADY_EXISTS' ||
      (body as { error_code?: string })?.error_code === 'email_taken' ||
      (body as { error_code?: string })?.error_code === 'username_taken'
    if (alreadyExists) {
      console.log(`[setup] User ${opts.email} already exists — skipping registration.`)
      return null
    }
    throw new Error(`[setup] Failed to register ${opts.email}: 400 ${JSON.stringify(body)}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[setup] Failed to register ${opts.email}: ${res.status} ${text}`)
  }

  return res.json()
}

/** POST /api/v1/auth/login  (form-encoded, returns Set-Cookie) */
async function loginViaApi(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password })
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  })

  if (!res.ok && res.status !== 302) {
    throw new Error(`[setup] Login failed for ${email}: ${res.status}`)
  }

  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length === 0) {
    throw new Error(`[setup] Login for ${email} returned no Set-Cookie header.`)
  }
  // Return raw cookie string for use in subsequent API requests
  return setCookie.map(c => c.split(';')[0]).join('; ')
}

/** GET /api/v1/auth/me — returns the current session object with user nested under `user` key */
async function getMe(cookieHeader: string): Promise<{ id: number; email: string; user_uuid: string }> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Cookie: cookieHeader },
  })
  if (!res.ok) throw new Error(`[setup] /auth/me failed: ${res.status}`)
  const data = (await res.json()) as {
    user?: { id: number; email: string; user_uuid: string }
    id?: number
    email?: string
    user_uuid?: string
  }
  // The endpoint wraps the user object: { user: { id, email, ... }, roles, ... }
  return data.user ?? (data as { id: number; email: string; user_uuid: string })
}

/** GET /api/v1/roles — list all roles, returns array of { id, slug, name } */
async function listRoles(cookieHeader: string): Promise<{ id: number; slug: string; name: string }[]> {
  const res = await fetch(`${API_URL}/roles`, {
    headers: { Cookie: cookieHeader },
  })
  if (!res.ok) throw new Error(`[setup] GET /roles failed: ${res.status}`)
  return res.json()
}

/** GET /api/v1/rbac/user-roles — find the numeric user ID for an email */
async function findUserIdByEmail(cookieHeader: string, email: string): Promise<number | null> {
  const res = await fetch(`${API_URL}/rbac/user-roles`, {
    headers: { Cookie: cookieHeader },
  })
  if (!res.ok) throw new Error(`[setup] GET /rbac/user-roles failed: ${res.status}`)
  const rows: { user_id: number; user?: { email: string } }[] = await res.json()
  const match = rows.find(r => r.user?.email === email)
  return match?.user_id ?? null
}

/**
 * Fall back to fetching the user's own session after they log in,
 * since non-admin calls to user-roles may not include the user.
 */
async function findOrFetchUserId(adminCookie: string, userCookie: string, email: string): Promise<number> {
  const fromRoles = await findUserIdByEmail(adminCookie, email)
  if (fromRoles !== null) return fromRoles

  // Fall back: call /auth/me as the user themselves
  const me = await getMe(userCookie)
  return me.id
}

/** POST /api/v1/rbac/roles/assign */
async function assignRole(cookieHeader: string, userId: number, roleId: number): Promise<void> {
  const res = await fetch(`${API_URL}/rbac/roles/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  })
  if (!res.ok) {
    const text = await res.text()
    // Idempotent: if already assigned, treat as success
    if (text.includes('already') || text.includes('duplicate') || res.status === 409) return
    throw new Error(`[setup] Role assignment failed: ${res.status} ${text}`)
  }
}

/**
 * Authenticate in a real browser and capture the storage state (cookies).
 * This is needed because Next.js server-side auth cookies are HttpOnly and
 * cannot be captured via fetch alone.
 */
async function captureStorageState(email: string, password: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()

  await page.goto('/en/login')

  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /login/i }).click()

  // Wait for redirect away from /login — indicates successful auth
  await page.waitForURL(url => !url.pathname.includes('/login'), {
    timeout: 15_000,
  })

  await context.storageState({ path: outputPath })
  await browser.close()
  console.log(`[setup] Saved storage state for ${email} → ${outputPath}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(STORAGE_STATE_DIR, { recursive: true })

  const teacherEmail = requireEnv('E2E_TEACHER_EMAIL')
  const teacherPassword = requireEnv('E2E_TEACHER_PASSWORD')
  const teacherFirstName = getEnvOr('E2E_TEACHER_FIRST_NAME', 'Eve')
  const teacherLastName = getEnvOr('E2E_TEACHER_LAST_NAME', 'Teach')

  const studentEmail = requireEnv('E2E_STUDENT_EMAIL')
  const studentPassword = requireEnv('E2E_STUDENT_PASSWORD')
  const studentFirstName = getEnvOr('E2E_STUDENT_FIRST_NAME', 'Sam')
  const studentLastName = getEnvOr('E2E_STUDENT_LAST_NAME', 'Learn')

  const adminEmail = requireEnv('E2E_ADMIN_EMAIL')
  const adminPassword = requireEnv('E2E_ADMIN_PASSWORD')

  // 1. Register Teacher + Student (idempotent — existing users are OK)
  await Promise.all([
    registerUser({
      email: teacherEmail,
      password: teacherPassword,
      firstName: teacherFirstName,
      lastName: teacherLastName,
    }),
    registerUser({
      email: studentEmail,
      password: studentPassword,
      firstName: studentFirstName,
      lastName: studentLastName,
    }),
  ])

  // 2. Log in as Admin via API to get a session cookie for role assignment
  const adminCookie = await loginViaApi(adminEmail, adminPassword)
  const teacherCookie = await loginViaApi(teacherEmail, teacherPassword)

  // 3. Resolve the teacher role id (configurable via E2E_TEACHER_ROLE_SLUG, default: 'instructor')
  const roles = await listRoles(adminCookie)
  const teacherRoleSlug = getEnvOr('E2E_TEACHER_ROLE_SLUG', 'instructor')
  const teacherRole = roles.find(r => r.slug === teacherRoleSlug)
  if (!teacherRole) {
    throw new Error(
      `[setup] Could not find role with slug "${teacherRoleSlug}". Available roles: ${roles.map(r => `${r.slug}(${r.name})`).join(', ')}`,
    )
  }

  // 4. Resolve teacher user ID and assign teacher role
  const teacherUserId = await findOrFetchUserId(adminCookie, teacherCookie, teacherEmail)
  await assignRole(adminCookie, teacherUserId, teacherRole.id)
  console.log(`[setup] Assigned role "${teacherRole.name}" to ${teacherEmail} (id=${teacherUserId})`)

  // 5. Capture real browser storage states (HttpOnly cookies)
  await captureStorageState(adminEmail, adminPassword, STORAGE_STATE.admin)
  await captureStorageState(teacherEmail, teacherPassword, STORAGE_STATE.teacher)
  await captureStorageState(studentEmail, studentPassword, STORAGE_STATE.student)

  console.log('[setup] Global setup complete.')
}
