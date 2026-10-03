import { m } from '#/paraglide/messages'
import type { MetricCard } from '#/shared/api/gen/types.gen'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { trendOf } from '../model/analytics'
import { trendLabels } from './labels'

const dash = '—'
const missing = (value: number | null | undefined): value is null | undefined => value === null || value === undefined

/** A KPI's value as text: `%` cards are shares, the rest are counts. */
export const metricValue = (card: Pick<MetricCard, 'value' | 'unit'>): string =>
  card.unit === '%' ? formatPercent(card.value) : formatNumber(card.value)

/** "+12 % vs the previous period · better": the words carry the verdict, the tone repeats it. None without a delta. */
export function metricChange(card: MetricCard): { text: string; tone: 'success' | 'destructive' | 'neutral' } | null {
  const delta = !missing(card.delta_pct)
    ? m.analytics_change_pct({ value: formatNumber(card.delta_pct, { signed: true }) })
    : !missing(card.delta_value)
      ? m.analytics_change_value({ value: formatNumber(card.delta_value, { signed: true }) })
      : null
  if (delta === null) return null
  const trend = trendLabels[trendOf(card)]
  return { text: `${delta} · ${trend.label()}`, tone: trend.tone }
}

/** Hours with one decimal; a dash when the server has no sample. */
export const hours = (value: number | null | undefined): string =>
  missing(value) ? dash : m.analytics_hours({ value: formatNumber(Math.round(value * 10) / 10) })

/** A 0..100 share; a dash when the server has no sample. */
export const percent = (value: number | null | undefined): string => (missing(value) ? dash : formatPercent(value))

/** A score or a count; a dash when the server has no sample. */
export const score = (value: number | null | undefined): string => (missing(value) ? dash : formatNumber(value))
