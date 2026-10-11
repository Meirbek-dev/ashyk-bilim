/**
 * ROUND3-17: the public detail pages (course, lesson, collection, profile) answer HTTP 404 for a resource that
 * does not exist. With Cache Components + partial prefetching every dynamic route streams a prerendered shell,
 * which commits the response to 200 before the page can call `notFound()`; so the proxy asks the API first and
 * rewrites a missing resource to an unmatched path, which Next answers with a real 404 (`[locale]/not-found.tsx`
 * renders the resource's own card from the headers below).
 */

export type MissingKind = 'course' | 'activity' | 'collection' | 'user'

/** Request headers the proxy hands to `[locale]/not-found.tsx`. */
export const MISSING_HEADERS = {
  kind: 'x-missing-resource',
  course: 'x-missing-course',
  guest: 'x-missing-guest',
} as const

export interface ResourceProbe {
  kind: MissingKind
  apiPath: string
  courseId?: string
  activityId?: string
}

const segment = '([^/]+)'
/** Legacy links carry `course_…` / `activity_…` / `collection_…` ids; the pages strip the prefix too. */
const id = (raw: string | undefined) => (raw ?? '').replace(/^(course|activity|collection)_/, '')
const PROBES: [RegExp, (m: RegExpExecArray) => ResourceProbe][] = [
  [new RegExp(`^/course/${segment}/?$`), m => ({ kind: 'course', apiPath: `courses/${id(m[1])}` })],
  [
    new RegExp(`^/course/${segment}/activity/${segment}/?$`),
    m => ({ kind: 'activity', apiPath: `activities/${id(m[2])}`, courseId: id(m[1]), activityId: id(m[2]) }),
  ],
  [new RegExp(`^/collection/${segment}/?$`), m => ({ kind: 'collection', apiPath: `collections/${id(m[1])}` })],
  [new RegExp(`^/user/${segment}/?$`), m => ({ kind: 'user', apiPath: `users/${m[1]}` })],
]

/** The API read that proves a public detail page's resource exists; `null` for every other page. */
export function resourceProbe(pathnameWithoutLocale: string): ResourceProbe | null {
  for (const [pattern, build] of PROBES) {
    const match = pattern.exec(pathnameWithoutLocale)
    if (match) return build(match)
  }
  return null
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/**
 * Whether the API says the resource is gone (404, or 422 for a malformed id). Any other answer - including a
 * 403, a 5xx or a timeout - lets the page render as before. A scheduled test is not missing: its lesson page
 * says when it opens (ROUND3-11).
 */
export async function isMissingResource(
  probe: ResourceProbe,
  apiBase: string,
  cookie: string | null,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  const get = (path: string) =>
    fetchImpl(new URL(path, apiBase).toString(), {
      headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
  try {
    const response = await get(probe.apiPath)
    if (response.status !== 404 && response.status !== 422) return false
    if (probe.kind !== 'activity' || response.status !== 404) return true
    const state = await get(`courses/${probe.courseId}/learner-state`)
    if (!state.ok) return true
    const body = (await state.json()) as {
      outline?: { activities?: { id: string; blocked_reason?: string | null }[] }[]
    }
    const entry = body.outline?.flatMap(chapter => chapter.activities ?? []).find(a => a.id === probe.activityId)
    return entry?.blocked_reason !== 'scheduled'
  } catch {
    return false
  }
}
