'use client'

import { useTranslations } from 'next-intl'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function CoursesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  return (
    <RouteErrorState
      actionLabel={t('tryAgain')}
      description={t('coursesListLoadError')}
      error={error}
      reset={reset}
      scope="courses-route"
      title={t('somethingWentWrong')}
    />
  )
}
