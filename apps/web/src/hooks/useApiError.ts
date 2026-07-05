'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { presentApiError } from '@/lib/api/error-presenter'
import type { ErrorRetryPolicy, ErrorSeverity } from '@/lib/api/error-presenter'
import type { ApiFieldError } from '@/lib/api/generated/api.schemas'

export interface ProcessedError {
  actionLabel: string
  code: string | null
  description: string
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
        try {
          const res = t(key)
          if (res === `Errors.${key}` || res === key) return fallbackValue
          return res
        } catch {
          return fallbackValue
        }
      }

      const processed = presentApiError(error, {
        copy: {
          get: getTranslation,
        },
        ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
      })

      // Bind validation errors to RHF if setError is provided
      if (options.setError && processed.fieldErrors.length > 0) {
        processed.fieldErrors.forEach(err => {
          if (err.field) {
            options.setError?.(err.field as Path<TFieldValues>, {
              type: 'server',
              message: err.message,
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
