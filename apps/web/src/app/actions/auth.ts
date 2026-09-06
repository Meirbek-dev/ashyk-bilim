'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { parseApiErrorEnvelope } from '@/lib/api/assertSuccess'
import { getPostAuthRedirect, normalizeReturnTo } from '@/lib/auth/redirect'
import { applyBackendSetCookies, postAuthJson, serverAuthFetch } from '@/lib/auth/server-auth-fetch'
import { SESSION_COOKIE_NAME } from '@/lib/auth/types'

/**
 * Auth server actions against the v2 BFF (ARCHITECTURE §7).
 *
 * The browser never talks to the identity provider: `POST /auth/login` runs
 * the headless Zitadel password (+ TOTP) check and answers with the session
 * cookie, which the action copies onto the app origin. Registration and
 * password reset are not part of the v2 contract (accounts are provisioned
 * by an admin or created through Google sign-in) — see DECISIONS.md P9.
 */

interface LoginActionInput {
  /** Username or email. */
  login: string
  password: string
  /** Second factor — resubmitted after an `mfa-required` answer. */
  totpCode?: string | null
  returnTo?: string | null
}

export type LoginFailureReason =
  | 'invalid_credentials'
  | 'mfa_required'
  | 'invalid_totp_code'
  | 'account_disabled'
  | 'rate_limited'
  | 'service_unavailable'
  | 'login_failed'

export interface AuthActionResult {
  ok: boolean
  reason?: LoginFailureReason
  /** Contract error code (`Errors.codes.<code>` i18n key) when the backend answered a problem. */
  code?: string
  /** `Retry-After` seconds on `rate_limited`. */
  retryAfterSeconds?: number
}

async function readProblem(response: Response) {
  const payload = await response.json().catch(() => null)
  return parseApiErrorEnvelope(payload)
}

function classifyLoginFailure(status: number, code: string | null): LoginFailureReason {
  switch (code) {
    case 'mfa-required':
      return 'mfa_required'
    case 'invalid-totp-code':
      return 'invalid_totp_code'
    case 'invalid-credentials':
      return 'invalid_credentials'
    case 'account-disabled':
      return 'account_disabled'
    case 'rate-limited':
      return 'rate_limited'
    case 'service-unavailable':
      return 'service_unavailable'
    default:
      break
  }
  if (status === 401) return 'invalid_credentials'
  if (status === 403) return 'account_disabled'
  if (status === 429) return 'rate_limited'
  if (status === 503 || status === 502 || status === 504) return 'service_unavailable'
  return 'login_failed'
}

export async function loginAction(input: LoginActionInput): Promise<AuthActionResult> {
  let response: Response
  try {
    response = await postAuthJson(
      'auth/login',
      {
        login: input.login.trim(),
        password: input.password,
        ...(input.totpCode ? { totp_code: input.totpCode.trim() } : {}),
      },
      { includeAuthCookies: false },
    )
  } catch {
    return { ok: false, reason: 'service_unavailable' }
  }

  if (!response.ok) {
    const problem = await readProblem(response)
    const code = problem?.code ?? null
    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
    return {
      ok: false,
      reason: classifyLoginFailure(response.status, code),
      ...(code ? { code } : {}),
      ...(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {}),
    }
  }

  await applyBackendSetCookies(response.headers)
  revalidatePath('/', 'layout')
  redirect(getPostAuthRedirect(input.returnTo))
}

export async function logoutAction(redirectTo?: string | null): Promise<void> {
  try {
    const response = await serverAuthFetch('auth/logout', { method: 'POST' })
    await applyBackendSetCookies(response.headers)
  } catch {
    // Logout is idempotent server-side; a transport failure must not trap the
    // user in a signed-in shell — the cookie is dropped below regardless.
  }
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  revalidatePath('/', 'layout')

  if (redirectTo) {
    redirect(normalizeReturnTo(redirectTo))
  }
}
