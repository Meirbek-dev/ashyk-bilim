'use client'

import { useTranslations } from 'next-intl'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Errors')

  return (
    <RouteErrorState
      actionLabel={t('retry')}
      description={t('coursesLoadErrorDescription')}
      error={error}
      reset={reset}
      scope="shared-courses-route"
      title={t('coursesLoadErrorTitle')}
    />
  )
}
