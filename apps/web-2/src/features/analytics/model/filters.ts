import * as v from 'valibot'

import { PLATFORM_TIME_ZONE } from '#/shared/i18n/format'

// The analytics filter set (spec 5.3, 7.8): the URL holds what the user chose, every API call gets the same 12
// query parameters from it. Malformed values fall back to the default, so a stale or hand-edited link still opens.

export const WINDOWS = ['7d', '28d', '90d'] as const
export const COMPARES = ['previous_period', 'none'] as const
export const BUCKETS = ['day', 'week'] as const
export const TABS = ['overview', 'learners', 'performance', 'operations'] as const
export type Tab = (typeof TABS)[number]

/** Rows per analytics table: the only numbered pages of the app (spec 7.6). */
export const PAGE_SIZE = 25

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

const LEARNER_SORTS = ['risk', 'progress', 'activity', 'name'] as const
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

/** How many filters differ from the defaults: the "Filters (n)" button at phone width. */
export const activeFilters = (filters: Filters): number =>
  [
    filters.window !== filterDefaults.window,
    filters.compare !== filterDefaults.compare,
    filters.bucket !== filterDefaults.bucket,
    filters.course !== undefined,
    filters.cohort !== undefined,
  ].filter(Boolean).length

/** The route of each tab. */
export const tabPaths = {
  overview: '/teach/analytics/overview',
  learners: '/teach/analytics/learners',
  performance: '/teach/analytics/performance',
  operations: '/teach/analytics/operations',
} as const satisfies Record<Tab, string>

/** The tab a path belongs to (a saved view remembers it); the layout's own path counts as overview. */
export const tabOf = (pathname: string): Tab => TABS.find(tab => pathname.endsWith(`/${tab}`)) ?? 'overview'

/** A header click of the at-risk table as URL state: only the keys the endpoint sorts by. */
export function learnerSort(sort: { id: string; desc: boolean } | undefined): {
  sort: LearnerSort | undefined
  desc: boolean | undefined
} {
  if (!sort || !v.is(v.picklist(LEARNER_SORTS), sort.id)) return { sort: undefined, desc: undefined }
  return { sort: sort.id, desc: sort.desc || undefined }
}

/** The filter form: selects hold strings, "" is "all" for the course and the group. */
export const filterFormSchema = v.object({
  window: v.picklist(WINDOWS),
  compare: v.picklist(COMPARES),
  bucket: v.picklist(BUCKETS),
  course: v.string(),
  cohort: v.string(),
})
export type FilterForm = v.InferOutput<typeof filterFormSchema>

export const toFilterForm = (filters: Filters): FilterForm => ({
  ...filters,
  course: filters.course ?? '',
  cohort: filters.cohort ?? '',
})

export const fromFilterForm = (form: FilterForm): Filters => v.parse(filtersSchema, form)

type Table = { page: number; sort?: string | undefined; desc?: boolean | undefined }

/** The contract's filter query: always the platform time zone; a table adds its page and order. */
export function apiQuery(filters: Filters, table?: Table) {
  return {
    window: filters.window,
    compare: filters.compare,
    bucket: filters.bucket,
    ...(filters.course ? { course_ids: filters.course } : {}),
    ...(filters.cohort ? { cohort_ids: filters.cohort } : {}),
    timezone: PLATFORM_TIME_ZONE,
    ...(table ? { page: table.page, page_size: PAGE_SIZE } : {}),
    ...(table?.sort ? { sort_by: table.sort, sort_order: table.desc ? 'desc' : 'asc' } : {}),
  }
}
