import * as v from 'valibot'

import { client } from '#/shared/api/gen/client.gen'
import type {
  ExportAssessmentOutcomesData,
  ExportAtRiskData,
  ExportCourseProgressData,
  ExportGradingBacklogData,
  MetricCard,
  SavedView,
} from '#/shared/api/gen/types.gen'

import { apiQuery, type Filters, filtersSchema, type Tab, TABS } from './filters'

/** Whether a KPI moved the good way: its `direction` read against `is_higher_better` (the color's second channel). */
export type Trend = 'better' | 'worse' | 'same'
export function trendOf(card: Pick<MetricCard, 'direction' | 'is_higher_better'>): Trend {
  if (card.direction === 'flat') return 'same'
  return (card.direction === 'up') === card.is_higher_better ? 'better' : 'worse'
}

/** Pages of a NumberedPage list; an empty list still has page 1. */
export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize))

/**
 * A saved view's tab and filters. `query` and `view_type` are free-form in the contract (SPEC: waits for the server),
 * so both are read back through the URL schemas: anything unknown becomes the default.
 */
export function viewTarget(view: Pick<SavedView, 'view_type' | 'query'>): { tab: Tab; filters: Filters } {
  const tab = v.is(v.picklist(TABS), view.view_type) ? view.view_type : 'overview'
  return { tab, filters: v.parse(filtersSchema, view.query) }
}

/**
 * The CSV exports exportAtRisk(), exportCourseProgress(), exportAssessmentOutcomes() and exportGradingBacklog() are
 * browser downloads, not fetches: plain links to their URLs with the page's filters. Relative, so they stay
 * same-origin (`vp dev` proxies /api/v2); the paths come from the client.
 */
export function exportHrefs(filters: Filters) {
  const query = apiQuery(filters)
  return {
    atRisk: client.buildUrl<ExportAtRiskData>({
      url: '/api/v2/analytics/teacher/exports/at-risk.csv',
      query,
      baseUrl: '',
    }),
    courseProgress: client.buildUrl<ExportCourseProgressData>({
      url: '/api/v2/analytics/teacher/exports/course-progress.csv',
      query,
      baseUrl: '',
    }),
    assessmentOutcomes: client.buildUrl<ExportAssessmentOutcomesData>({
      url: '/api/v2/analytics/teacher/exports/assessment-outcomes.csv',
      query,
      baseUrl: '',
    }),
    gradingBacklog: client.buildUrl<ExportGradingBacklogData>({
      url: '/api/v2/analytics/teacher/exports/grading-backlog.csv',
      query,
      baseUrl: '',
    }),
  }
}

/**
 * One drill-through row. `DrillThroughResponse.items` is `object[]` in the contract (SPEC: waits for a typed union):
 * these are the fields the server writes per metric, read defensively; a row that does not match is skipped.
 */
const drillRowSchema = v.object({
  user_id: v.string(),
  user_display_name: v.string(),
  course_name: v.optional(v.string()),
  progress_pct: v.optional(v.number()),
  last_activity_at_unix: v.nullish(v.number()),
  assessment_title: v.optional(v.string()),
  age_hours: v.optional(v.number()),
  submission_id: v.optional(v.string()),
  best_score: v.nullish(v.number()),
  passed: v.optional(v.boolean()),
})
export type DrillRow = v.InferOutput<typeof drillRowSchema>

export const drillRows = (items: readonly unknown[]): DrillRow[] =>
  items.flatMap(item => {
    const row = v.safeParse(drillRowSchema, item)
    return row.success ? [row.output] : []
  })
