'use client'

import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface AIErrorRecoveryProps {
  message: string
  onRetry?: () => void
}

export function AIErrorRecovery({ message, onRetry }: AIErrorRecoveryProps) {
  const t = useTranslations('AiExperience.errorRecovery')
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
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
