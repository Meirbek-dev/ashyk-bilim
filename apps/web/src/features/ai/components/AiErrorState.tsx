'use client'

import { AlertTriangleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export interface AiErrorStateProps {
  message?: string
  onRetry?: () => void
  onDismiss?: () => void
}

export function AiErrorState({ message, onRetry, onDismiss }: AiErrorStateProps) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const errorMessage = message || t('defaultErrorMessage')

  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangleIcon aria-hidden="true" />
      <AlertTitle>{t('errorStateTitle')}</AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
      {(onRetry || onDismiss) && (
        <div className="mt-3 flex gap-2">
          {onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('retry')}
            </Button>
          )}
          {onDismiss && (
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              {t('dismiss')}
            </Button>
          )}
        </div>
      )}
    </Alert>
  )
}
