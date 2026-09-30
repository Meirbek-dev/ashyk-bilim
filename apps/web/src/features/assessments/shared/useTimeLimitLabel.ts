'use client'

import { useTranslations } from 'next-intl'

/** Localized "50 мин" / "1 ч 30 мин" for a policy time limit in seconds. */
export function useTimeLimitLabel(): (seconds: number) => string {
  const t = useTranslations('Features.ActivityWorkspace')
  return seconds => {
    const totalMinutes = Math.round(seconds / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (!hours) return t('timeLimitMinutes', { minutes })
    return minutes ? t('timeLimitHoursMinutes', { hours, minutes }) : t('timeLimitHours', { hours })
  }
}
