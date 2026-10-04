import { ApiError } from '#/shared/api/errors'
import type { RegisterRequest } from '#/shared/api/gen/types.gen'

/** The sign-up field a contract code names (`username-taken`, `email-taken`): shown under it, not as a form message. */
export function signupFieldOf(error: unknown): keyof RegisterRequest | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'username-taken') return 'username'
  if (error.code === 'email-taken') return 'email'
  return null
}

/** A 422 on the code: wrong or expired (the server answers the same for an unknown address: no enumeration). */
export const isWrongCode = (error: unknown): boolean =>
  error instanceof ApiError && error.fieldErrors.some(fieldError => fieldError.field === 'code')

/** The reset code is wrong, used or expired, or the login is unknown (one answer: no enumeration). */
export const isResetCodeInvalid = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'reset-code-invalid'

/** The error the reset form shows as its message: not the code's (under the code) nor one with field errors. */
export const resetFormError = (error: unknown): unknown =>
  isResetCodeInvalid(error) || (error instanceof ApiError && error.fieldErrors.length > 0) ? null : error
