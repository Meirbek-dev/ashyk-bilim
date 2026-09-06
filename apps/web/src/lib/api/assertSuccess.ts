/**
 * The app-side error type for every API failure.
 *
 * The v2 contract answers every error as RFC 9457 `application/problem+json`
 * (ARCHITECTURE §5): `{type, title, status, code, detail, field_errors,
 * details, request_id}`. `code` is a stable kebab-case key from the closed
 * `ErrorCode` registry and is what the UI translates (`Errors.codes.<code>`);
 * `detail`/`title` are English developer text and only ever a fallback.
 */
import type { FieldError, Problem } from '@/lib/api/generated/zod'

/** Wire shape of a problem+json body (re-exported for callers). */
export type ApiErrorEnvelope = Problem
export type ApiFieldError = FieldError

/** Codes minted by the client transport (never by the server). */
export type ClientErrorCode =
  | 'CLIENT_TIMEOUT'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_ABORTED'
  | 'INVALID_JSON_RESPONSE'
  | 'INVALID_CLIENT_REQUEST'
  | 'CLIENT_INVARIANT_VIOLATION'

interface APIErrorInit {
  code: string
  message: string
  status: number
  data?: unknown
  details?: Record<string, unknown> | null
  fieldErrors?: ApiFieldError[]
  requestId?: string | null
  headers?: Record<string, string>
  path?: string | null
  cause?: unknown
  envelope?: ApiErrorEnvelope | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readFieldErrors(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) return []
  const out: ApiFieldError[] = []
  for (const item of value) {
    const record = asRecord(item)
    const field = readString(record, 'field')
    if (!field) continue
    out.push({
      field,
      code: readString(record, 'code') ?? 'invalid',
      message: readString(record, 'message') ?? '',
    })
  }
  return out
}

/**
 * Parse a problem+json body. Returns `null` when the payload is not a
 * problem document (e.g. an nginx HTML error page or an empty body).
 */
export function parseApiErrorEnvelope(value: unknown): ApiErrorEnvelope | null {
  const data = asRecord(value)
  if (!data) return null

  const code = readString(data, 'code')
  const title = readString(data, 'title')
  const status = typeof data.status === 'number' ? data.status : null
  if (!code || status === null) return null

  return {
    type: readString(data, 'type') ?? `about:blank`,
    title: title ?? code,
    status,
    code: code as ApiErrorEnvelope['code'],
    detail: readString(data, 'detail'),
    details: asRecord(data.details),
    field_errors: readFieldErrors(data.field_errors),
    request_id: readString(data, 'request_id'),
  }
}

/** Best human-readable (English) message for an error payload. */
export function getApiErrorMessage(payload: unknown, fallback = 'Request failed'): string {
  const envelope = parseApiErrorEnvelope(payload)
  if (envelope) return envelope.detail ?? envelope.title ?? fallback

  const data = asRecord(payload)
  const detail = data?.detail
  return (typeof detail === 'string' ? detail : null) ?? readString(data, 'message') ?? fallback
}

export class APIError extends Error {
  public status: number
  /** Stable machine code (`ErrorCode` for server failures, `ClientErrorCode` for transport ones). */
  public code: string
  /** Machine-readable context for some codes (e.g. `{expected, actual}` on a lock conflict). */
  public details: Record<string, unknown> | null
  public fieldErrors: ApiFieldError[]
  public requestId: string | null
  public envelope: ApiErrorEnvelope | null
  public data: unknown
  public headers: Record<string, string>
  public path: string | null

  public constructor(init: APIErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'APIError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? null
    this.fieldErrors = init.fieldErrors ?? []
    this.requestId = init.requestId ?? null
    this.envelope = init.envelope ?? null
    this.data = init.data ?? null
    this.headers = init.headers ?? {}
    this.path = init.path ?? null
  }

  /** `Retry-After` in seconds when the server sent one. */
  public get retryAfterSeconds(): number | null {
    const raw = this.headers['retry-after']
    if (!raw) return null
    const seconds = Number.parseInt(raw, 10)
    return Number.isFinite(seconds) ? seconds : null
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
  let data: unknown
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
    message: getApiErrorMessage(data, response.statusText || 'Request failed'),
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
    details?: Record<string, unknown> | null
    path?: string | null
    requestId?: string | null
    status?: number
  } = {},
): APIError {
  return new APIError({
    code,
    message,
    status: options.status ?? 0,
    details: options.details ?? null,
    requestId: options.requestId ?? null,
    path: options.path ?? null,
    cause: options.cause,
  })
}

export function isApiError(error: unknown): error is APIError {
  return error instanceof APIError
}

/** True for a server error carrying this exact contract code. */
export function hasErrorCode(error: unknown, code: ApiErrorEnvelope['code'] | (string & {})): boolean {
  return isApiError(error) && error.code === code
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
