'use client'

import { useTranslations } from 'next-intl'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function AssessmentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  return (
    <RouteErrorState
      actionLabel={t('tryAgain')}
      description={t('assessmentLoadError')}
      error={error}
      reset={reset}
      scope="assessments-route"
      title={t('somethingWentWrong')}
    />
  )
}
