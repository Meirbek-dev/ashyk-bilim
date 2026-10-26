import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ErrorCode } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'

import { googleErrorText, retryMinutes } from '../model/login-search'

const messages: Partial<Record<ErrorCode, () => string>> = {
  'invalid-credentials': m.auth_login_error_credentials,
  'invalid-totp-code': m.auth_login_error_totp,
  'account-disabled': m.auth_login_error_disabled,
}

/** Any guest request's error text; a rate limit names the minutes to wait (`Retry-After`). */
export function limitedText(error: unknown): string {
  if (!(error instanceof ApiError) || error.code !== 'rate-limited') return presentError(error)
  const minutes = retryMinutes(error.retryAfter)
  return minutes === null ? m.auth_login_error_rate_limited() : m.auth_login_error_retry_in({ minutes })
}

function attemptText(error: unknown): string {
  if (!(error instanceof ApiError) || error.code === 'rate-limited') return limitedText(error)
  return (messages[error.code] ?? m.auth_login_error_generic)()
}

type LoginErrorProps = { error: unknown; googleError: string | undefined }

/** The sign-in attempt's error, else the Google return error. `mfa-required` is the next step, not an error. */
export function LoginError({ error, googleError }: LoginErrorProps) {
  if (error instanceof ApiError && error.code === 'mfa-required') return null
  if (error) return <ErrorAlert>{attemptText(error)}</ErrorAlert>
  return googleError ? <ErrorAlert>{googleErrorText(googleError)}</ErrorAlert> : null
}
