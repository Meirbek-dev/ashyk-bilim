import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { MetricCard } from '#/shared/api/gen/types.gen'

import { hours, metricChange } from './kpi'

const card = (extra: Partial<MetricCard>): MetricCard => ({
  benchmark: null,
  benchmark_label: null,
  delta_pct: null,
  delta_value: 100,
  direction: 'up',
  is_higher_better: true,
  label: 'Completion',
  unit: '%',
  value: 100,
  ...extra,
})

describe('metricChange', () => {
  test('B-ANL-39 a share changes in percentage points, a count in plain units', () => {
    expect(metricChange(card({}))?.text).toContain(m.analytics_change_points({ value: '+100' }))
    expect(metricChange(card({ unit: null, delta_value: 3 }))?.text).toContain(
      m.analytics_change_value({ value: '+3' }),
    )
  })
})

describe('hours', () => {
  test('B-ANL-15 a time under an hour reads in minutes, longer ones in hours, none as a dash', () => {
    expect(hours(0.9)).toBe(m.analytics_minutes({ value: '54' }))
    expect(hours(0.004)).toBe(m.analytics_minutes({ value: '1' }))
    expect(hours(0)).toBe(m.analytics_hours({ value: '0' }))
    expect(hours(26.25)).toBe(m.analytics_hours({ value: '26,3' }))
    expect(hours(null)).toBe('—')
  })
})
