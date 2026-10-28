import * as v from 'valibot'

import { getLocale } from '#/paraglide/runtime'
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
 * browser downloads, not fetches: plain links to their URLs with the page's filters, in the interface language
 * (`?lang=`: a link cannot set `Accept-Language`). Relative, so they stay
 * same-origin (`vp dev` proxies /api/v2); the paths come from the client.
 */
export function exportHrefs(filters: Filters) {
  const query = { ...apiQuery(filters), lang: getLocale() }
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
  course_id: v.optional(v.string()),
  course_name: v.optional(v.string()),
  progress_pct: v.optional(v.number()),
  last_activity_at_unix: v.nullish(v.number()),
  assessment_title: v.optional(v.string()),
  age_hours: v.optional(v.number()),
  submission_id: v.optional(v.string()),
  /** A file task's attempt waiting for review (a backlog row without a submission). */
  attempt_id: v.optional(v.string()),
  best_score: v.nullish(v.number()),
  passed: v.optional(v.boolean()),
  completed_steps: v.optional(v.number()),
  total_steps: v.optional(v.number()),
  submitted_at_unix: v.nullish(v.number()),
  sla_breached: v.optional(v.boolean()),
  attempts: v.optional(v.number()),
  last_score: v.nullish(v.number()),
})
export type DrillRow = v.InferOutput<typeof drillRowSchema>

/**
 * A row's identity: the submission or file attempt, else the learner in the course (by id: two courses may share a name,
 * and keyed by name their rows collided).
 */
export const drillRowKey = (row: DrillRow): string =>
  row.submission_id ?? row.attempt_id ?? `${row.user_id}:${row.course_id ?? row.course_name ?? ''}`

export const drillRows = (items: readonly unknown[]): DrillRow[] =>
  items.flatMap(item => {
    const row = v.safeParse(drillRowSchema, item)
    return row.success ? [row.output] : []
  })

/**
 * The admin "programs" are the courses grouped by author: the server names a group `courses_by:<author>` or
 * `unassigned_courses` (B-ANL-36). The author's name is what a person reads; anything else is shown as it came.
 */
export function programAuthor(name: string): string | null {
  if (name === 'unassigned_courses') return null
  return name.startsWith('courses_by:') ? name.slice('courses_by:'.length) : name
}
