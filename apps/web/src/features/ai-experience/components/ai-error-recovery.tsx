'use client'

import { RotateCcwIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useApiError } from '@/hooks/useApiError'
import { hasErrorCode } from '@/lib/api/assertSuccess'

interface AIErrorRecoveryProps {
  /** The failure (an `APIError` renders through `Errors.codes.<code>`). */
  error?: unknown
  /** Already-localized text; wins over `error`. */
  message?: string | undefined
  onRetry?: () => void
}

/** A 503 `ai-disabled` is a state, not a failure: no retry, neutral tone. */
function isAIUnavailable(error: unknown) {
  return hasErrorCode(error, 'ai-disabled')
}

export function AIErrorRecovery({ error, message, onRetry }: AIErrorRecoveryProps) {
  const t = useTranslations('AiExperience.errorRecovery')
  const { handleApiError } = useApiError()

  if (isAIUnavailable(error)) {
    return (
      <Alert>
        <SparklesIcon aria-hidden="true" />
        <AlertTitle>{t('unavailableTitle')}</AlertTitle>
        <AlertDescription>{t('unavailableDescription')}</AlertDescription>
      </Alert>
    )
  }

  const description = message ?? handleApiError(error, { fallback: t('fallback') }).message
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button variant="destructive" size="sm" onClick={onRetry}>
            <RotateCcwIcon data-icon="inline-start" />
            {t('retry')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  )
}
