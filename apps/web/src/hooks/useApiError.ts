'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { presentApiError } from '@/lib/api/error-presenter'
import type { ErrorRetryPolicy, ErrorSeverity } from '@/lib/api/error-presenter'
import { isApiError } from '@/lib/api/assertSuccess'
import type { ApiFieldError } from '@/lib/api/assertSuccess'

function retryAfterSecondsOf(error: unknown): number | null {
  if (!isApiError(error)) return null
  const fromDetails = error.details?.['retry_after_seconds']
  return error.retryAfterSeconds ?? (typeof fromDetails === 'number' ? fromDetails : null)
}

export interface ProcessedError {
  actionLabel: string
  code: string | null
  description: string
  details: Record<string, unknown> | null
  showRetry: boolean
  severity: ErrorSeverity
  retryPolicy: ErrorRetryPolicy
  status: number | null
  supportReference: string | null
  fieldErrors: ApiFieldError[]
  telemetryExpected: boolean
  title: string
  message: string
}

interface ApiErrorOptions<TFieldValues extends FieldValues> {
  fallback?: string
  retry?: () => void
  setError?: UseFormSetError<TFieldValues>
  toastId?: string | number
}

function normalizeOptions<TFieldValues extends FieldValues>(
  setErrorOrOptions?: UseFormSetError<TFieldValues> | ApiErrorOptions<TFieldValues>,
  fallback?: string,
): ApiErrorOptions<TFieldValues> {
  if (typeof setErrorOrOptions === 'function') {
    return fallback === undefined ? { setError: setErrorOrOptions } : { setError: setErrorOrOptions, fallback }
  }
  return setErrorOrOptions ?? {}
}

/**
 * Translate any API failure for display. Contract error codes resolve through
 * `Errors.codes.<code>` (kept in sync with the server registry by
 * `scripts/sync-error-codes.mjs`); field errors resolve through
 * `Errors.fields.<code>` and are bound to react-hook-form when `setError` is
 * given.
 */
export function useApiError<TFieldValues extends FieldValues = FieldValues>() {
  const t = useTranslations('Errors')

  const handleApiError = useCallback(
    (
      error: unknown,
      setErrorOrOptions?: UseFormSetError<TFieldValues> | ApiErrorOptions<TFieldValues>,
      fallback?: string,
    ): ProcessedError => {
      const options = normalizeOptions(setErrorOrOptions, fallback)
      const getTranslation = (key: string, fallbackValue: string): string => {
        if (!t.has(key)) return fallbackValue
        return t(key)
      }
      const codeTranslation = (code: string): string | undefined => {
        const key = `codes.${code}`
        return t.has(key) ? t(key) : undefined
      }
      const fieldTranslation = (fieldError: ApiFieldError): string => {
        const key = `fields.${fieldError.code}`
        return t.has(key) ? t(key) : fieldError.message || getTranslation('validationFailed', 'Invalid value')
      }

      const processed = presentApiError(error, {
        copy: {
          get: getTranslation,
          byCode: codeTranslation,
        },
        ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
      })
      // A 429 that knows its window says when (UX-101): `Retry-After` /
      // `details.retry_after_seconds` → «Попробуйте через N минут».
      const retryAfter = retryAfterSecondsOf(error)
      if (processed.status === 429 && retryAfter && t.has('rateLimitedRetry')) {
        processed.description = t('rateLimitedRetry', { minutes: Math.max(1, Math.ceil(retryAfter / 60)) })
      }

      // Bind validation errors to RHF if setError is provided
      if (options.setError && processed.fieldErrors.length > 0) {
        processed.fieldErrors.forEach(err => {
          if (err.field) {
            options.setError?.(err.field as Path<TFieldValues>, {
              type: 'server',
              message: fieldTranslation(err),
            })
          }
        })
      }

      return {
        ...processed,
        message: processed.description,
      }
    },
    [t],
  )

  const toastApiError = useCallback(
    (
      error: unknown,
      setErrorOrOptions?: UseFormSetError<TFieldValues> | ApiErrorOptions<TFieldValues>,
      customFallback?: string,
    ): ProcessedError => {
      const options = normalizeOptions(setErrorOrOptions, customFallback)
      const processed = handleApiError(error, options)
      let toastMessage = processed.description

      if (processed.supportReference) {
        const refLabel = t.has('reference') ? t('reference') : 'Reference'
        toastMessage += ` (${refLabel}: ${processed.supportReference})`
      }

      toast.error(toastMessage, {
        ...(options.toastId === undefined ? {} : { id: options.toastId }),
        ...(processed.showRetry && options.retry
          ? { action: { label: processed.actionLabel, onClick: options.retry } }
          : {}),
      })
      return processed
    },
    [handleApiError, t],
  )

  return {
    handleApiError,
    toastApiError,
  }
}
