import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ErrorCode } from '#/shared/api/gen/types.gen'
import { vErrorCode } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'

import { retryMinutes } from '../model/login-search'

const messages: Partial<Record<ErrorCode, () => string>> = {
  'invalid-credentials': m.auth_login_error_credentials,
  'invalid-totp-code': m.auth_login_error_totp,
  'account-disabled': m.auth_login_error_disabled,
}

function attemptText(error: unknown): string {
  if (!(error instanceof ApiError)) return presentError(error)
  if (error.code === 'rate-limited') {
    const minutes = retryMinutes(error.retryAfter)
    return minutes === null ? m.auth_login_error_rate_limited() : m.auth_login_error_retry_in({ minutes })
  }
  return (messages[error.code] ?? m.auth_login_error_generic)()
}

// A failed Google sign-in comes back as /login?error=<code>: a contract code, or the callback's own "cancelled".
function googleText(code: string): string {
  if (!v.is(vErrorCode, code)) return m.auth_login_error_google_cancelled()
  return presentError(new ApiError({ status: 400, code, fieldErrors: [], requestId: null, retryAfter: null }))
}

type LoginErrorProps = { error: unknown; googleError: string | undefined }

/** The sign-in attempt's error, else the Google return error. `mfa-required` is the next step, not an error. */
export function LoginError({ error, googleError }: LoginErrorProps) {
  if (error instanceof ApiError && error.code === 'mfa-required') return null
  if (error) return <ErrorAlert>{attemptText(error)}</ErrorAlert>
  return googleError ? <ErrorAlert>{googleText(googleError)}</ErrorAlert> : null
}
