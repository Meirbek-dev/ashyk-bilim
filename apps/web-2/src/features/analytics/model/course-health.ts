import { m } from '#/paraglide/messages'
import type { ContentHealthRow } from '#/shared/api/gen/types.gen'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

const FUNNEL: Record<string, () => string> = {
  enrolled: m.analytics_funnel_enrolled,
  active_7d: m.analytics_funnel_active_7d,
  completed: m.analytics_funnel_completed,
}

/** A completion-funnel step: its stable code in words; an unknown code is shown as sent. */
export const funnelLabel = (code: string): string => FUNNEL[code]?.() ?? code

/** One content-health signal as a sentence with its value (days, percent, works); no value - the signal alone. */
export function healthValue(row: Pick<ContentHealthRow, 'signal' | 'value'>): string {
  const value = row.value
  if (row.signal === 'content_freshness')
    return value === null
      ? m.analytics_health_freshness_unknown()
      : m.analytics_health_freshness({ days: formatNumber(value) })
  if (row.signal === 'average_progress')
    return m.analytics_health_progress({ value: value === null ? '-' : formatPercent(value) })
  return m.analytics_health_backlog({ count: formatNumber(value ?? 0) })
}
