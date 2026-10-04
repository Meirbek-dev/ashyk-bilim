// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature statically (AGENTS.md "Entry chunk").
import type { QueryClient } from '@tanstack/react-query'
import * as v from 'valibot'

// The analytics filter set (spec 5.3, 7.8): the URL holds what the user chose, every API call gets the same 12
// query parameters from it. Malformed values fall back to the default, so a stale or hand-edited link still opens.

export const WINDOWS = ['7d', '28d', '90d'] as const
export const COMPARES = ['previous_period', 'none'] as const
export const BUCKETS = ['day', 'week'] as const
export const filterDefaults = { window: '28d', compare: 'previous_period', bucket: 'day' } as const

const choice = <const T extends readonly string[]>(options: T, fallback: T[number]) =>
  v.fallback(v.optional(v.picklist(options), fallback), fallback)
const optionalId = v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined)
const page = v.fallback(v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1), 1)

/** Shared by the four tabs: set on the `/teach/analytics` layout route, inherited by each tab. */
export const filtersSchema = v.object({
  window: choice(WINDOWS, filterDefaults.window),
  compare: choice(COMPARES, filterDefaults.compare),
  bucket: choice(BUCKETS, filterDefaults.bucket),
  course: optionalId,
  cohort: optionalId,
})
export type Filters = v.InferOutput<typeof filtersSchema>

/** The KPI tiles with rows behind them (`pass_rate` belongs to one assessment, in performance). */
const TILE_METRICS = ['active_learners', 'completion_rate', 'backlog'] as const
export type TileMetric = (typeof TILE_METRICS)[number]

/** overview and operations: the KPI tile whose rows are open below the tiles (drill-through), and their page. */
export const metricSearchSchema = v.object({
  metric: v.fallback(v.optional(v.picklist(TILE_METRICS)), undefined),
  page,
})

export const LEARNER_SORTS = ['risk', 'progress', 'activity', 'name'] as const
export type LearnerSort = (typeof LEARNER_SORTS)[number]

/** learners: the at-risk table (page, sort) and the learner open in the side panel (a learner of one course). */
export const learnersSearchSchema = v.object({
  page,
  sort: v.fallback(v.optional(v.picklist(LEARNER_SORTS)), undefined),
  desc: v.fallback(v.optional(v.boolean()), undefined),
  learnerId: optionalId,
  courseId: optionalId,
})

/** performance: the two tables' pages, or a drill-down into one course or one assessment (`page` then pages it). */
export const performanceSearchSchema = v.object({
  page,
  coursePage: page,
  courseId: optionalId,
  assessmentType: v.fallback(v.optional(v.picklist(['quiz', 'exam', 'code_challenge'])), undefined),
  assessmentId: optionalId,
})

/** The filters alone: what a tab link and a saved view carry (a tab's page, sort and drill-down stay behind). */
export function pickFilters(search: Filters): Filters {
  const { window, compare, bucket, course, cohort } = search
  return { window, compare, bucket, course, cohort }
}

/** The layout's guard (loaders.ts): loaded on demand, it reads a group through the SDK, which the entry chunk lacks. */
export const hasUnknownCohort = async (queryClient: QueryClient, filters: Filters): Promise<boolean> =>
  (await import('./loaders')).hasUnknownCohort(queryClient, filters)
