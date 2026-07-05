'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError, parseApiErrorEnvelope, getSupportReference } from '@/lib/api/assertSuccess'
import type { ApiErrorEnvelope, ApiFieldError } from '@/lib/api/generated/api.schemas'

export interface ProcessedError {
  message: string
  actionLabel: string
  showRetry: boolean
  supportReference: string | null
  fieldErrors: ApiFieldError[]
}

interface ApiErrorOptions<TFieldValues extends FieldValues> {
  fallback?: string
  retry?: () => void
  setError?: UseFormSetError<TFieldValues>
  toastId?: string | number
}

function readEnvelope(error: unknown): ApiErrorEnvelope | null {
  if (isApiError(error)) {
    return error.envelope ?? parseApiErrorEnvelope(error.data) ?? null
  }
  return parseApiErrorEnvelope(error)
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

export function useApiError<TFieldValues extends FieldValues = FieldValues>() {
  const t = useTranslations('Errors')

  const handleApiError = useCallback(
    (
      error: unknown,
      setErrorOrOptions?: UseFormSetError<TFieldValues> | ApiErrorOptions<TFieldValues>,
      fallback?: string,
    ): ProcessedError => {
      const options = normalizeOptions(setErrorOrOptions, fallback)
      const parsed = readEnvelope(error)
      const isApi = isApiError(error)
      const supportReference = getSupportReference(error)
      const fieldErrors = parsed?.field_errors ?? (isApi ? error.fieldErrors : [])

      // Bind validation errors to RHF if setError is provided
      if (options.setError && fieldErrors.length > 0) {
        fieldErrors.forEach(err => {
          if (err.field) {
            options.setError?.(err.field as Path<TFieldValues>, {
              type: 'server',
              message: err.message,
            })
          }
        })
      }

      // Map error codes/statuses to localized strings
      const status = isApi ? error.status : undefined
      const code = parsed?.code || (isApi ? error.code : undefined)

      let message = options.fallback || parsed?.message || (error instanceof Error ? error.message : '')
      let actionLabel = t('tryAgain')
      let showRetry = true

      // Safe lookup with fallbacks if keys are missing from next-intl
      const getTranslation = (key: string, fallback: string): string => {
        try {
          const res = t(key)
          // If next-intl returns the key itself as a fallback (e.g. 'Errors.rateLimited' or 'Errors.tryAgain'), use fallback
          if (res === `Errors.${key}` || res === key) {
            return fallback
          }
          return res
        } catch {
          return fallback
        }
      }

      if (code === 'RATE_LIMITED' || status === 429) {
        message = getTranslation('rateLimited', 'Too many requests. Please try again shortly.')
        showRetry = false
      } else if (code === 'NETWORK_UNAVAILABLE' || code === 'CLIENT_TIMEOUT' || status === 408) {
        message = getTranslation('networkUnavailable', 'Network unavailable. Please check your connection.')
        actionLabel = getTranslation('tryAgain', 'Try again')
      } else if (status === 401) {
        message = getTranslation('sessionExpired', 'Your session has expired. Please log in again.')
        showRetry = false
      } else if (status === 403) {
        message = getTranslation('permissionDenied', 'You do not have permission to perform this action.')
        showRetry = false
      } else if (fieldErrors.length > 0) {
        message = getTranslation('validationFailed', 'Please correct the highlighted fields and try again.')
        showRetry = false
      } else if (status && status >= 500) {
        message = getTranslation('serverError', 'An internal server error occurred. Please try again later.')
      }

      // If message is still empty, use defaultError fallback
      if (!message) {
        message = getTranslation('defaultError', 'Failed to correctly process the request. Please try again.')
      }

      return {
        message,
        actionLabel,
        showRetry,
        supportReference,
        fieldErrors,
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
      let toastMessage = processed.message

      if (processed.supportReference) {
        const refLabel = t('reference') || 'Reference'
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
