// ApiError is in the entry chunk (G-05): no runtime import of ./gen here; client.ts parses the problem body.
import { createSerializationAdapter } from '@tanstack/react-router'

import type { ErrorCode, FieldError } from './gen/types.gen'

type ApiErrorInit = {
  status: number
  code: ErrorCode
  fieldErrors: FieldError[]
  requestId: string | null
  retryAfter: number | null
}

/** Every failed API response, built from the server's problem+json body. Branch only on `code`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly fieldErrors: FieldError[]
  readonly requestId: string | null
  readonly retryAfter: number | null

  constructor(init: ApiErrorInit) {
    super(`API ${init.status} ${init.code}`)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.fieldErrors = init.fieldErrors
    this.requestId = init.requestId
    this.retryAfter = init.retryAfter
  }
}

/** True when the API says the caller has no live session (not a failed login attempt). */
export const isSessionLost = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 401 &&
  (error.code === 'unauthenticated' || error.code === 'session-expired')

/** Keeps an ApiError an ApiError across SSR (loader or guard on the server, error view in the browser). */
export const apiErrorAdapter = createSerializationAdapter({
  key: 'ab-api-error',
  test: (value: unknown) => value instanceof ApiError,
  toSerializable: ({ status, code, fieldErrors, requestId, retryAfter }: ApiError) => ({
    status,
    code,
    fieldErrors,
    requestId,
    retryAfter,
  }),
  fromSerializable: (init: ApiErrorInit) => new ApiError(init),
})
