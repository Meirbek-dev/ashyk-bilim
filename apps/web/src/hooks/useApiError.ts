'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { UseFormSetError } from 'react-hook-form'
import { isApiError, parseApiErrorEnvelope, getSupportReference } from '@/lib/api/assertSuccess'
import type { ApiFieldError } from '@/lib/api/generated/api.schemas'

export interface ProcessedError {
  message: string
  actionLabel: string
  showRetry: boolean
  supportReference: string | null
  fieldErrors: ApiFieldError[]
}

export function useApiError() {
  const t = useTranslations('Errors')

  const handleApiError = useCallback(
    (error: unknown, setError?: UseFormSetError<any>): ProcessedError => {
      const parsed = parseApiErrorEnvelope(error)
      const isApi = isApiError(error)
      const supportReference = getSupportReference(error)

      // Bind validation errors to RHF if setError is provided
      if (setError && parsed?.field_errors && parsed.field_errors.length > 0) {
        parsed.field_errors.forEach(err => {
          if (err.field) {
            setError(err.field, {
              type: 'server',
              message: err.message,
            })
          }
        })
      }

      // Map error codes/statuses to localized strings
      const status = isApi ? error.status : undefined
      const code = parsed?.code || (isApi ? error.code : undefined)

      let message = parsed?.message || (error instanceof Error ? error.message : '')
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
        fieldErrors: parsed?.field_errors || [],
      }
    },
    [t]
  )

  const toastApiError = useCallback(
    (error: unknown, setError?: UseFormSetError<any>, customFallback?: string): ProcessedError => {
      const processed = handleApiError(error, setError)
      let toastMessage = customFallback || processed.message
      
      if (processed.supportReference) {
        const refLabel = t('reference') || 'Reference'
        toastMessage += ` (${refLabel}: ${processed.supportReference})`
      }

      toast.error(toastMessage)
      return processed
    },
    [handleApiError, t]
  )

  return {
    handleApiError,
    toastApiError,
  }
}
