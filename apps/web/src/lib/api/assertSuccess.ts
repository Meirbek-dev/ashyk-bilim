import type { components } from '@/lib/api/generated/schema'

/**
 * Unified API error handling for mutation hooks.
 *
 * Replaces three near-identical helpers that existed across mutation files:
 *  - ensureMutationSuccess  (useCoursesMutations)
 *  - toError                (useActivityMutations)
 *  - ensureSuccess          (useChapterMutations - was broken: only threw on 409)
 */

export type ApiErrorEnvelope = components['schemas']['ApiErrorEnvelope']
export type ApiFieldError = components['schemas']['ApiFieldError']

export type ClientErrorCode =
  | 'CLIENT_TIMEOUT'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_ABORTED'
  | 'INVALID_JSON_RESPONSE'
  | 'INVALID_CLIENT_REQUEST'
  | 'CLIENT_INVARIANT_VIOLATION'

interface ResponseLike {
  data?: unknown
  HTTPmessage?: unknown
  message?: unknown
  path?: unknown
  requestId?: unknown
  status?: unknown
  statusText?: unknown
  url?: unknown
}

interface APIErrorInit {
  code: string
  message: string
  status: number
  data?: unknown
  details?: ApiErrorEnvelope['details']
  fieldErrors?: ApiFieldError[]
  requestId?: string | null
  headers?: Record<string, string>
  path?: string | null
  cause?: unknown
  envelope?: ApiErrorEnvelope | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function parseApiErrorEnvelope(value: unknown): ApiErrorEnvelope | null {
  const data = asRecord(value)
  if (!data) return null

  const code = readString(data, 'code')
  const message = readString(data, 'message')
  const requestId = readString(data, 'request_id')

  if (!code || !message || !requestId) return null

  const fieldErrors = data.field_errors
  return {
    code,
    message,
    details: data.details === undefined ? null : (data.details as ApiErrorEnvelope['details']),
    request_id: requestId,
    field_errors: Array.isArray(fieldErrors) ? (fieldErrors as ApiFieldError[]) : [],
  }
}

function formatIssueDetail(detail: unknown): string | null {
  const detailRecord = asRecord(detail)
  if (!detailRecord) return null

  const { issues } = detailRecord
  if (!Array.isArray(issues) || issues.length === 0) return null

  const firstMessages = issues
    .map(issue => readString(asRecord(issue), 'message'))
    .filter((message): message is string => message !== null)
    .slice(0, 3)
  if (firstMessages.length === 0) return null

  const suffix = issues.length > firstMessages.length ? ` (+${issues.length - firstMessages.length})` : ''
  return `${firstMessages.join(' ')}${suffix}`
}

function legacyMessage(data: Record<string, unknown> | null, response: ResponseLike): string {
  const detail = data?.detail
  return (
    (typeof detail === 'string' ? detail : null) ??
    formatIssueDetail(detail) ??
    readString(asRecord(response), 'HTTPmessage') ??
    readString(asRecord(response), 'message') ??
    'Request failed'
  )
}

export function getApiErrorMessage(payload: unknown, fallback = 'Request failed'): string {
  const envelope = parseApiErrorEnvelope(payload)
  if (envelope) return envelope.message

  const data = asRecord(payload)
  return (
    legacyMessage(data, {
      message: fallback,
    }) || fallback
  )
}

export class APIError extends Error {
  public status: number
  public code: string
  public details: ApiErrorEnvelope['details']
  public fieldErrors: ApiFieldError[]
  public requestId: string | null
  public envelope: ApiErrorEnvelope | null
  public detail: unknown
  public data: unknown
  public headers: Record<string, string>
  public path: string | null

  public constructor(responseOrInit: unknown) {
    const initRecord = asRecord(responseOrInit)
    const explicitInit =
      initRecord &&
      typeof initRecord.code === 'string' &&
      typeof initRecord.message === 'string' &&
      typeof initRecord.status === 'number'
        ? (initRecord as unknown as APIErrorInit)
        : null

    if (explicitInit) {
      super(explicitInit.message, explicitInit.cause === undefined ? undefined : { cause: explicitInit.cause })
      this.name = 'APIError'
      this.status = explicitInit.status
      this.code = explicitInit.code
      this.details = explicitInit.details ?? null
      this.fieldErrors = explicitInit.fieldErrors ?? []
      this.requestId = explicitInit.requestId ?? null
      this.envelope = explicitInit.envelope ?? null
      this.detail = this.envelope ?? explicitInit.details ?? explicitInit.data ?? null
      this.data = explicitInit.data ?? null
      this.headers = explicitInit.headers ?? {}
      this.path = explicitInit.path ?? null
      return
    }

    const responseRecord = initRecord
    const responseLike: ResponseLike = responseRecord ?? {}
    const data = responseRecord && 'data' in responseRecord ? responseRecord.data : null
    const dataRecord = asRecord(data)
    const envelope = parseApiErrorEnvelope(data)
    const message = envelope?.message ?? legacyMessage(dataRecord, responseLike)

    super(message)
    this.name = 'APIError'
    this.status = typeof responseLike.status === 'number' ? responseLike.status : 500
    this.code = envelope?.code ?? readString(dataRecord, 'code') ?? readString(dataRecord, 'error_code') ?? 'UNKNOWN'
    this.details = envelope?.details ?? null
    this.fieldErrors = envelope?.field_errors ?? []
    this.requestId = envelope?.request_id ?? readString(asRecord(responseLike), 'requestId')
    this.envelope = envelope
    this.detail = envelope ?? data
    this.data = data
    this.headers = {}
    this.path = readString(asRecord(responseLike), 'path') ?? readString(asRecord(responseLike), 'url')
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    record[key.toLowerCase()] = value
  }
  return record
}

export async function parseApiError(response: Response, path?: string): Promise<APIError> {
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  const envelope = parseApiErrorEnvelope(data)
  const headers = headersToRecord(response.headers)
  const requestId = envelope?.request_id ?? response.headers.get('x-request-id')
  return new APIError({
    code: envelope?.code ?? `HTTP_${response.status}`,
    message: envelope?.message ?? getApiErrorMessage(data, response.statusText || 'Request failed'),
    status: response.status,
    data,
    details: envelope?.details ?? null,
    fieldErrors: envelope?.field_errors ?? [],
    requestId,
    headers,
    path: (path ?? response.url) || null,
    envelope,
  })
}

export function clientApiError(
  code: ClientErrorCode,
  message: string,
  options: {
    cause?: unknown
    details?: ApiErrorEnvelope['details']
    path?: string | null
    requestId?: string | null
    status?: number
  } = {},
): APIError {
  return new APIError({
    code,
    message,
    status: options.status ?? 0,
    details: options.details,
    requestId: options.requestId ?? null,
    path: options.path ?? null,
    cause: options.cause,
  })
}

export function isApiError(error: unknown): error is APIError {
  return error instanceof APIError
}

export function isRetryableApiError(error: unknown): boolean {
  if (!isApiError(error)) return false
  if (error.code === 'CLIENT_TIMEOUT' || error.code === 'NETWORK_UNAVAILABLE' || error.code === 'REQUEST_ABORTED') {
    return true
  }
  return error.status === 408 || error.status === 429 || error.status >= 500
}

export function getSupportReference(error: unknown): string | null {
  if (!isApiError(error)) return null
  return error.requestId || error.headers['x-correlation-id'] || null
}

/**
 * Asserts that a service-layer response indicates success.
 * Throws {@link APIError} otherwise.
 *
 * Use this with functions that return `{success, status, data, ...}` (i.e.
 * those backed by `getResponseMetadata`).  Functions that use `errorHandling`
 * already throw on non-2xx, so you don't need this for them.
 */
export function assertSuccess<T extends { success?: boolean }>(response: T): T {
  if (response?.success) return response
  throw new APIError(response)
}
