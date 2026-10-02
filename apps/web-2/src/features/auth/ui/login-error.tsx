import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ErrorCode } from '#/shared/api/gen/types.gen'
import { Alert } from '#/shared/ui/alert'

const messages: Partial<Record<ErrorCode, () => string>> = {
  'invalid-credentials': m.auth_login_error_credentials,
  'invalid-totp-code': m.auth_login_error_totp,
  'rate-limited': m.auth_login_error_rate_limited,
  'account-disabled': m.auth_login_error_disabled,
}

// The generated mutation types its error as the problem body; at runtime it is always an ApiError (client.ts).
export function LoginError({ error }: { error: unknown }) {
  if (!error || (error instanceof ApiError && error.code === 'mfa-required')) return null
  const message = error instanceof ApiError ? messages[error.code] : undefined
  return <Alert>{(message ?? m.auth_login_error_generic)()}</Alert>
}
