import { createSerializationAdapter } from '@tanstack/react-router'
import * as v from 'valibot'

import type { ErrorCode, FieldError } from './gen/types.gen'
import { vProblem } from './gen/valibot.gen'

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

  static async fromResponse(response: Response): Promise<ApiError> {
    // A proxy in front of the API can answer with HTML: such a body is not a problem, not a crash.
    const body: unknown = await response.json().catch(() => null)
    const parsed = v.safeParse(vProblem, body)
    const problem = parsed.success ? parsed.output : null
    const retryAfter = Number(response.headers.get('retry-after'))
    return new ApiError({
      status: response.status,
      code: problem?.code ?? 'internal',
      fieldErrors: problem?.field_errors ?? [],
      requestId: problem?.request_id ?? response.headers.get('x-request-id'),
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    })
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
