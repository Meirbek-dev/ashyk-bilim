import { infiniteQueryOptions, type InfiniteData } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  getPlatformOptions,
  listCoursesInfiniteQueryKey,
  listCoursesOptions,
  searchInfiniteQueryKey,
  searchOptions,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listCollections, listCourses, search } from '#/shared/api/gen/sdk.gen'
import type { CourseId, CoursePage, SearchResults } from '#/shared/api/gen/types.gen'

import { type CoursesFilter, nextCoursesCursor, SEARCH_LIMIT } from './model/catalog'
import { type SitemapPage, sitemapPages } from './model/sitemap'

const PAGE_SIZE = 20
/** "A few courses" on the landing. */
const LANDING_COURSES = 6

/** The platform's name and texts: public, the landing reads it before any session exists. */
export const platformOptions = () => getPlatformOptions()

/**
 * The newest published courses the caller may see (a guest: public ones). Published only: the landing and an empty
 * /home suggest courses to start, and staff would otherwise be offered their own drafts.
 */
export const landingCoursesOptions = () =>
  listCoursesOptions({ query: { limit: LANDING_COURSES, sort: 'updated', preset: 'published' } })

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

/** One `search` answer holds every section: the palette's few hits per section. */
export const searchResultsOptions = (q: string, limit: number) => searchOptions({ query: { q, limit } })

/** The search page: every section a page at a time, the next page by the answer's `next_cursor` (B-CAT-07). */
export const searchPagesOptions = (q: string) => {
  const options = { query: { q, limit: SEARCH_LIMIT } }
  return infiniteQueryOptions<
    SearchResults,
    ApiError,
    InfiniteData<SearchResults>,
    ReturnType<typeof searchInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: searchInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await search({
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

/** Pages read for `/sitemap.xml` at most (100 items each): a crawler waits for one answer, not a crawl of the API. */
const SITEMAP_PAGES = 50

async function readAll<T>(read: (cursor: string | undefined) => Promise<{ items: T[]; next_cursor?: string | null }>) {
  const items: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < SITEMAP_PAGES; page += 1) {
    const answer = await read(cursor)
    items.push(...answer.items)
    if (!answer.next_cursor) break
    cursor = answer.next_cursor
  }
  return items
}

/** B-CAT-30: the public pages `/sitemap.xml` lists, read from the published catalog and the collections. */
export async function publicPages(): Promise<SitemapPage[]> {
  const [courses, collections] = await Promise.all([
    readAll(
      async cursor =>
        (await listCourses({ query: { limit: 100, preset: 'published', cursor }, throwOnError: true })).data,
    ),
    readAll(async cursor => (await listCollections({ query: { limit: 100, cursor }, throwOnError: true })).data),
  ])
  return sitemapPages(courses, collections)
}
