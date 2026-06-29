'use client'

import { useTranslations } from 'next-intl'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function CourseError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  return (
    <RouteErrorState
      actionLabel={t('tryAgain')}
      description={t('courseLoadError')}
      error={error}
      reset={reset}
      scope="course-route"
      title={t('somethingWentWrong')}
    />
  )
}
