'use client'

import { useTranslations } from 'next-intl'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function GradebookError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  return (
    <RouteErrorState
      actionLabel={t('retry')}
      description={t('gradebookLoadErrorDescription')}
      error={error}
      reset={reset}
      scope="gradebook"
      title={t('gradebookLoadError')}
    />
  )
}
