import { logoutAction } from '@/app/actions/auth'
import { apiJson } from '@/lib/api-client'
import { broadcastLogout } from '@/components/providers/session-provider'
import { SessionSummary, TotpEnrollment } from '@/lib/api/generated/zod'
import type { SessionSummary as SessionSummaryType, TotpEnrollment as TotpEnrollmentType } from '@/lib/api/generated/zod'

interface LogoutOptions {
  redirectTo?: string
}

export async function logout(options?: LogoutOptions): Promise<void> {
  broadcastLogout()
  await logoutAction(options?.redirectTo ?? '/login')
}

// ── Sessions (BFF) ─────────────────────────────────────────────────────────────

/** All live sessions of the caller (`GET /auth/sessions`). */
export async function listSessions(): Promise<SessionSummaryType[]> {
  return apiJson('auth/sessions', {}, data => SessionSummary.array().parse(data))
}

/** Revoke one of the caller's sessions by its non-bearer handle. */
export async function revokeSession(handle: string): Promise<void> {
  await apiJson(`auth/sessions/${encodeURIComponent(handle)}`, { method: 'DELETE' })
}

// ── Password (self-service) ────────────────────────────────────────────────────

/**
 * `POST /auth/password` — Zitadel checks the current password
 * (401 `invalid-credentials`); every other session of the caller is revoked.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiJson('auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

// ── TOTP multi-factor (self-service) ───────────────────────────────────────────

/** Start TOTP enrollment; the secrets are shown exactly once. */
export async function startTotpEnrollment(): Promise<TotpEnrollmentType> {
  return apiJson('auth/mfa/totp', { method: 'POST' }, data => TotpEnrollment.parse(data))
}

/** Activate TOTP with the first code from the authenticator app. */
export async function verifyTotpEnrollment(code: string): Promise<void> {
  await apiJson('auth/mfa/totp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  })
}

/** Remove the TOTP authenticator (idempotent). */
export async function removeTotp(): Promise<void> {
  await apiJson('auth/mfa/totp', { method: 'DELETE' })
}
