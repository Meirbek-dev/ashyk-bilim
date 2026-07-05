import { getSupportReference, isApiError, isRetryableApiError, parseApiErrorEnvelope } from '@/lib/api/assertSuccess'
import type { ApiErrorEnvelope, ApiFieldError } from '@/lib/api/generated/api.schemas'

export type ErrorSeverity = 'info' | 'warning' | 'error'
export type ErrorRetryPolicy = 'none' | 'manual' | 'after-delay' | 'conditional'

type CopyKey =
  | 'conflict'
  | 'defaultError'
  | 'dependencyUnavailable'
  | 'invalidClientRequest'
  | 'networkUnavailable'
  | 'notFound'
  | 'permissionDenied'
  | 'rateLimited'
  | 'requestCancelled'
  | 'serverError'
  | 'sessionExpired'
  | 'tryAgain'
  | 'validationFailed'

export interface ApiErrorPresenterCopy {
  get?: (key: CopyKey, fallback: string) => string
  byCode?: Partial<Record<string, string>>
}

export interface PresentApiErrorOptions {
  copy?: ApiErrorPresenterCopy
  fallback?: string
}

export interface PresentedApiError {
  actionLabel: string
  code: string | null
  description: string
  fieldErrors: ApiFieldError[]
  retryPolicy: ErrorRetryPolicy
  severity: ErrorSeverity
  showRetry: boolean
  status: number | null
  supportReference: string | null
  telemetryExpected: boolean
  title: string
}

function readEnvelope(error: unknown): ApiErrorEnvelope | null {
  if (isApiError(error)) {
    return error.envelope ?? parseApiErrorEnvelope(error.data) ?? null
  }
  return parseApiErrorEnvelope(error)
}

function copy(options: PresentApiErrorOptions, key: CopyKey, fallback: string): string {
  return options.copy?.get?.(key, fallback) ?? fallback
}

function isDependencyFailure(code: string | null, status: number | null): boolean {
  return Boolean(code?.endsWith('_UNAVAILABLE')) || status === 502 || status === 503 || status === 504
}

function shouldReport(error: unknown, status: number | null, code: string | null): boolean {
  if (!isApiError(error)) return true
  if (code === 'REQUEST_ABORTED') return false
  if (status !== null && status >= 400 && status < 500 && status !== 429) return false
  return true
}

export function presentApiError(error: unknown, options: PresentApiErrorOptions = {}): PresentedApiError {
  const envelope = readEnvelope(error)
  const apiError = isApiError(error) ? error : null
  const status = apiError?.status ?? null
  const code = envelope?.code ?? apiError?.code ?? null
  const fieldErrors = envelope?.field_errors ?? apiError?.fieldErrors ?? []
  const actionLabel = copy(options, 'tryAgain', 'Try again')
  const codeMessage = code ? options.copy?.byCode?.[code] : undefined

  let title = 'Request failed'
  let description =
    codeMessage ??
    options.fallback ??
    envelope?.message ??
    (apiError ? apiError.message : '') ??
    (error instanceof Error ? error.message : '')
  let retryPolicy: ErrorRetryPolicy = isRetryableApiError(error) ? 'manual' : 'none'
  let severity: ErrorSeverity = 'error'

  if (code === 'RATE_LIMITED' || status === 429) {
    title = 'Too many requests'
    description = codeMessage ?? copy(options, 'rateLimited', 'Too many requests. Try again shortly.')
    retryPolicy = 'after-delay'
    severity = 'warning'
  } else if (code === 'NETWORK_UNAVAILABLE' || code === 'CLIENT_TIMEOUT' || status === 408) {
    title = 'Connection problem'
    description =
      codeMessage ?? copy(options, 'networkUnavailable', 'The request took too long. Check your connection and retry.')
    retryPolicy = 'manual'
    severity = 'warning'
  } else if (code === 'REQUEST_ABORTED') {
    title = 'Request cancelled'
    description = codeMessage ?? copy(options, 'requestCancelled', 'The request was cancelled.')
    retryPolicy = 'none'
    severity = 'info'
  } else if (code === 'INVALID_CLIENT_REQUEST' || code === 'CLIENT_INVARIANT_VIOLATION') {
    title = 'Request could not be sent'
    description =
      codeMessage ??
      copy(options, 'invalidClientRequest', 'The request could not be sent because required data is missing.')
    retryPolicy = 'none'
  } else if (status === 401) {
    title = 'Session expired'
    description = codeMessage ?? copy(options, 'sessionExpired', 'Your session expired. Sign in again to continue.')
    retryPolicy = 'none'
  } else if (status === 403) {
    title = 'Access denied'
    description = codeMessage ?? copy(options, 'permissionDenied', 'You do not have access to this resource.')
    retryPolicy = 'none'
  } else if (status === 404) {
    title = 'Not found'
    description =
      codeMessage ?? copy(options, 'notFound', 'This item is no longer available or you do not have access.')
    retryPolicy = 'none'
  } else if (status === 409 || status === 412) {
    title = 'Conflict'
    description =
      codeMessage ?? copy(options, 'conflict', 'This was changed elsewhere. Review the latest version before saving.')
    retryPolicy = 'conditional'
    severity = 'warning'
  } else if (fieldErrors.length > 0 || status === 422 || code === 'VALIDATION_ERROR') {
    title = 'Check the form'
    description = codeMessage ?? copy(options, 'validationFailed', 'Check the highlighted fields and try again.')
    retryPolicy = 'none'
    severity = 'warning'
  } else if (isDependencyFailure(code, status)) {
    title = 'Service unavailable'
    description =
      codeMessage ?? copy(options, 'dependencyUnavailable', 'This service is temporarily unavailable. Try again later.')
    retryPolicy = 'manual'
  } else if (status !== null && status >= 500) {
    title = 'Something went wrong'
    description =
      codeMessage ??
      copy(options, 'serverError', 'Something went wrong. Retry or contact support with the reference below.')
    retryPolicy = 'manual'
  }

  if (!description) {
    description = copy(options, 'defaultError', 'Failed to correctly process the request. Please try again.')
  }

  return {
    actionLabel,
    code,
    description,
    fieldErrors,
    retryPolicy,
    severity,
    showRetry: retryPolicy === 'manual' || retryPolicy === 'conditional',
    status,
    supportReference: getSupportReference(error),
    telemetryExpected: shouldReport(error, status, code),
    title,
  }
}
