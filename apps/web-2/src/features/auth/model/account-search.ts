import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type { RegisterRequest } from '#/shared/api/gen/types.gen'

/** /verify-email?email=&code=: the link in the verification email fills both fields. */
export const verifyEmailSearchSchema = v.object({ email: v.optional(v.string()), code: v.optional(v.string()) })

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
