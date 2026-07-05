'use client'

import { useTranslations } from 'next-intl'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function ActivityEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('Errors')

  return (
    <RouteErrorState
      actionLabel={t('retry')}
      description={t('activityLoadErrorDescription')}
      error={error}
      reset={reset}
      scope="activity-editor-route"
      title={t('activityLoadErrorTitle')}
    />
  )
}
