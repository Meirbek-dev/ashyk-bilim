import * as v from 'valibot'

import type { SortOrder } from '#/shared/api/gen/types.gen'
import { PLATFORM_TIME_ZONE } from '#/shared/i18n/format'

import {
  BUCKETS,
  COMPARES,
  filterDefaults,
  type Filters,
  filtersSchema,
  LEARNER_SORTS,
  type LearnerSort,
  WINDOWS,
} from '../route'

export {
  BUCKETS,
  COMPARES,
  type Filters,
  filtersSchema,
  type LearnerSort,
  learnersSearchSchema,
  metricSearchSchema,
  performanceSearchSchema,
  pickFilters,
  type TileMetric,
  WINDOWS,
} from '../route'

// The analytics filter set (spec 5.3, 7.8): its URL schemas live in ../route.ts (entry chunk); the rest is here.

export const TABS = ['overview', 'learners', 'performance', 'operations'] as const
export type Tab = (typeof TABS)[number]

/** Rows per analytics table: the only numbered pages of the app (spec 7.6). */
export const PAGE_SIZE = 25

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
  const sortOrder: SortOrder = table?.desc ? 'desc' : 'asc'
  return {
    window: filters.window,
    compare: filters.compare,
    bucket: filters.bucket,
    ...(filters.course ? { course_ids: filters.course } : {}),
    ...(filters.cohort ? { cohort_ids: filters.cohort } : {}),
    timezone: PLATFORM_TIME_ZONE,
    ...(table ? { page: table.page, page_size: PAGE_SIZE } : {}),
    ...(table?.sort ? { sort_by: table.sort, sort_order: sortOrder } : {}),
  }
}
