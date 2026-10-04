import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { drillRows, exportHrefs, pageCount, trendOf, viewTarget } from './analytics'
import { filtersSchema } from './filters'

const COURSE = '01a0fe71-945c-760e-a11a-037490019fda'

describe('analytics model', () => {
  test('B-ANL-05 a KPI change reads against is_higher_better', () => {
    expect(trendOf({ direction: 'up', is_higher_better: true })).toBe('better')
    expect(trendOf({ direction: 'up', is_higher_better: false })).toBe('worse')
    expect(trendOf({ direction: 'down', is_higher_better: false })).toBe('better')
    expect(trendOf({ direction: 'flat', is_higher_better: true })).toBe('same')
  })

  test('B-ANL-07 drill-through rows are read field by field; a row of another shape is skipped', () => {
    const rows = drillRows([
      { user_id: 'u1', user_display_name: 'A', course_name: 'C', progress_pct: 40, is_completed: false },
      { user_id: 'u2', user_display_name: 'B', best_score: null, passed: false },
      { unexpected: true },
    ])
    expect(rows.map(row => row.user_display_name)).toEqual(['A', 'B'])
    expect(rows[0]?.progress_pct).toBe(40)
  })

  test('B-ANL-16 CSV links are relative API paths with the filters and the time zone', () => {
    const hrefs = exportHrefs(v.parse(filtersSchema, { window: '7d', course: COURSE }))
    expect(hrefs.atRisk).toBe(
      `/api/v2/analytics/teacher/exports/at-risk.csv?window=7d&compare=previous_period&bucket=day&course_ids=${COURSE}&timezone=Asia%2FAlmaty`,
    )
    expect(hrefs.gradingBacklog.startsWith('/api/v2/analytics/teacher/exports/grading-backlog.csv?')).toBe(true)
    expect(hrefs.courseProgress).toContain('course-progress.csv?')
    expect(hrefs.assessmentOutcomes).toContain('assessment-outcomes.csv?')
  })

  test('B-ANL-17 a saved view opens its tab with its filters; unknown parts fall back', () => {
    expect(viewTarget({ view_type: 'operations', query: { window: '90d', course: COURSE } })).toEqual({
      tab: 'operations',
      filters: { window: '90d', compare: 'previous_period', bucket: 'day', course: COURSE, cohort: undefined },
    })
    expect(viewTarget({ view_type: 'legacy-watchlist', query: { window: 'all' } }).tab).toBe('overview')
    expect(viewTarget({ view_type: 'learners', query: { window: 'all' } }).filters.window).toBe('28d')
  })

  test('B-ANL-18 pages are counted from total and page_size; an empty list is one page', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
  })
})
