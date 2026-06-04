'use client'

import { ActivitySquare, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface AnalyticsEmptyStateProps {
  title: string
  description: string
}

/**
 * Empty state for analytics views – no Card wrapper, flat layout.
 * Icon is inline without a colored container.
 */
export default function AnalyticsEmptyState({ title, description }: AnalyticsEmptyStateProps) {
  const t = useTranslations('TeacherAnalytics')
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4 py-10">
      <div className="text-center">
        <ActivitySquare className="text-muted-foreground mx-auto mb-5 h-10 w-10" aria-hidden="true" strokeWidth={1.5} />
        <h2 className="text-foreground mb-2 text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground mb-5 text-sm leading-relaxed">{description}</p>
        <div className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('emptyState.accessNote')}</span>
        </div>
      </div>
    </div>
  )
}
