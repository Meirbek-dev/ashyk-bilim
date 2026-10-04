import { infiniteQueryOptions, type InfiniteData } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  getPlatformOptions,
  listCoursesInfiniteQueryKey,
  listCoursesOptions,
  searchOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listCourses } from '#/shared/api/gen/sdk.gen'
import type { CourseId, CoursePage } from '#/shared/api/gen/types.gen'

import { type CoursesFilter, nextCoursesCursor, SEARCH_LIMIT } from './model/catalog'

const PAGE_SIZE = 20
/** "A few courses" on the landing. */
const LANDING_COURSES = 6

/** The platform's name and texts: public, the landing reads it before any session exists. */
export const platformOptions = () => getPlatformOptions()

/** The newest courses the caller may see (a guest: public ones). */
export const landingCoursesOptions = () => listCoursesOptions({ query: { limit: LANDING_COURSES, sort: 'updated' } })

// Composed by hand: the generated listCoursesInfiniteOptions types its queryFn as skippable, which
// useSuspenseInfiniteQuery rejects. Key and request still come from the generated client.
export const coursesListOptions = (filter: CoursesFilter) => {
  const options = { query: { limit: PAGE_SIZE, ...filter } }
  return infiniteQueryOptions<
    CoursePage,
    ApiError,
    InfiniteData<CoursePage>,
    ReturnType<typeof listCoursesInfiniteQueryKey>,
    CourseId | undefined
  >({
    queryKey: listCoursesInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listCourses({
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCoursesCursor,
  })
}

/** One `search` answer holds every section; the full page and the palette differ only in the per-section cap. */
export const searchResultsOptions = (q: string, limit: number = SEARCH_LIMIT) => searchOptions({ query: { q, limit } })
