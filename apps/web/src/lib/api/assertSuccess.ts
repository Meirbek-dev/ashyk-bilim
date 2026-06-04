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

interface ResponseLike {
  data?: unknown
  HTTPmessage?: unknown
  message?: unknown
  status?: unknown
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

  public constructor(response: unknown) {
    const responseRecord = asRecord(response)
    const responseLike: ResponseLike = responseRecord ?? {}
    const data =
      responseRecord && typeof responseRecord.data === 'object' && responseRecord.data !== null
        ? responseRecord.data
        : null
    const dataRecord = asRecord(data)
    const envelope = parseApiErrorEnvelope(data)
    const message = envelope?.message ?? legacyMessage(dataRecord, responseLike)

    super(message)
    this.name = 'APIError'
    this.status = typeof responseLike.status === 'number' ? responseLike.status : 500
    this.code = envelope?.code ?? readString(dataRecord, 'code') ?? readString(dataRecord, 'error_code') ?? 'UNKNOWN'
    this.details = envelope?.details ?? null
    this.fieldErrors = envelope?.field_errors ?? []
    this.requestId = envelope?.request_id ?? null
    this.envelope = envelope
    this.detail = envelope ?? data
  }
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
