import { logoutAction } from '@/app/actions/auth'
import { apiJson } from '@/lib/api-client'
import { broadcastLogout } from '@/components/providers/session-provider'
import { DEFAULT_THEME_MODE, DEFAULT_THEME_NAME, applyTheme, getStoredThemeMode, getTheme } from '@/lib/themes'
import { SessionInfo, SessionSummary, TotpEnrollment } from '@/lib/api/generated/zod'
import type {
  SessionInfo as SessionInfoType,
  SessionSummary as SessionSummaryType,
  TotpEnrollment as TotpEnrollmentType,
} from '@/lib/api/generated/zod'

interface LogoutOptions {
  redirectTo?: string
}

export async function logout(options?: LogoutOptions): Promise<void> {
  broadcastLogout()
  // The account's theme leaves with it (BUG-380): the next visitor of this
  // browser starts from the default, not from the signed-out user's choice.
  applyTheme(getTheme(DEFAULT_THEME_NAME, getStoredThemeMode() ?? DEFAULT_THEME_MODE))
  await logoutAction(options?.redirectTo ?? '/login')
}

// ── Sessions (BFF) ─────────────────────────────────────────────────────────────

/** The caller's current session (`GET /auth/session`): grants and `mfa_enabled`. */
export async function getSessionInfo(signal: AbortSignal | null = null): Promise<SessionInfoType> {
  return apiJson('auth/session', { signal }, data => SessionInfo.parse(data))
}

/** All live sessions of the caller (`GET /auth/sessions`). */
export async function listSessions(signal: AbortSignal | null = null): Promise<SessionSummaryType[]> {
  return apiJson('auth/sessions', { signal }, data => SessionSummary.array().parse(data))
}

/** Revoke one of the caller's sessions by its non-bearer handle. */
export async function revokeSession(handle: string): Promise<void> {
  await apiJson(`auth/sessions/${encodeURIComponent(handle)}`, { method: 'DELETE' })
}

// ── Password (self-service) ────────────────────────────────────────────────────

/**
 * `POST /auth/password` - Zitadel checks the current password
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

/** Remove the TOTP authenticator (idempotent); an active one takes a current code from it. */
export async function removeTotp(code: string): Promise<void> {
  await apiJson('auth/mfa/totp', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  })
}
