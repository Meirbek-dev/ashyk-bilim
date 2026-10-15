// The old web's URL shapes (apps/web/src/app, `/ru|kz|en/...`, ids sometimes with a `course_` / `activity_` prefix)
// and where they live here. Bookmarks, e-mails and notifications keep pointing at them: the catch-all route answers
// each with a 301 to its web-2 equivalent; anything else stays a 404.

/** The old prefixes (`/kz` was Kazakh; the ISO forms were aliases). */
const LOCALE_PREFIX = /^\/(?:ru|kz|kk|en|ru-ru|kk-kz|en-us)(?=\/|$)/i
const ENTITY_PREFIX = /^(?:course|chapter|activity|collection|submission|assessment)_/

/** An old `/assessments/<id>` link: where it goes depends on the assessment (the route looks it up). */
export type AssessmentLink = { assessment: string; review: string | null }

type To = (ids: (string | undefined)[], query: URLSearchParams) => string

const id = (value = '') => value.replace(ENTITY_PREFIX, '')
const ID = '([\\w-]+)'
const analytics = '/teach/analytics'
const studio = (course: string) => `/teach/courses/${id(course)}`

/** Old path (without the locale prefix) -> new URL. Exact paths; the first match wins. */
const PATHS: [string, To][] = [
  ['/', () => '/'],
  ['/courses', () => '/courses'],
  ['/collections', () => '/collections'],
  // The old create page: the list with its create dialog open.
  ['/collections/new', () => '/collections?create=true'],
  [`/collection/${ID}`, ([c]) => `/collections/${id(c)}`],
  [`/course/${ID}`, ([c]) => `/courses/${id(c)}`],
  [`/course/${ID}/activity/${ID}`, ([c, a]) => `/learn/${id(c)}/${id(a)}`],
  [`/(?:editor/)?course/${ID}/activity/${ID}/edit`, ([c = '', a]) => `${studio(c)}/activities/${id(a)}/edit`],
  ['/search', (_, query) => withQuery('/search', { q: query.get('q') })],
  ['/trail', () => '/learning'],
  ['/user/([^/]+)', ([u = '']) => `/users/${u}`],
  ['/unauthorized', () => '/'],
  ['/(?:auth/)?login', (_, query) => withQuery('/login', { redirect: returnTo(query) })],
  ['/(?:auth/)?signup', (_, query) => withQuery('/signup', { redirect: returnTo(query) })],
  ['/(?:auth/)?verify-email', () => '/verify-email'],
  ['/(?:auth/)?reset-password', () => '/reset-password'],
  ['/dash', () => '/teach'],
  ['/dash/admin', () => '/admin'],
  ['/dash/admin/roles', () => '/admin/roles'],
  ['/dash/admin/users', () => '/admin/users'],
  ['/dash/users/settings(?:/users)?', () => '/admin/users'],
  ['/dash/users/settings/usergroups', () => '/teach/groups'],
  ['/dash/analytics', () => analytics],
  ['/dash/analytics/admin', () => '/admin/analytics'],
  ['/dash/analytics/overview', () => `${analytics}/overview`],
  ['/dash/analytics/(?:learners/at-risk|watchlist)', () => `${analytics}/learners`],
  ['/dash/analytics/operations', () => `${analytics}/operations`],
  ['/dash/analytics/(?:performance|courses|assessments)', () => `${analytics}/performance`],
  [`/dash/analytics/courses/${ID}`, ([c]) => withQuery(`${analytics}/performance`, { courseId: id(c) })],
  [
    `/dash/analytics/assessments/${ID}/${ID}`,
    ([type, a]) => withQuery(`${analytics}/performance`, { assessmentType: type, assessmentId: id(a) }),
  ],
  ['/dash/courses(?:/new)?', () => '/teach/courses'],
  [`/dash/courses/${ID}`, ([c = '']) => studio(c)],
  [`/dash/courses/${ID}/(?:details|certificate)`, ([c = '']) => `${studio(c)}/settings`],
  [`/dash/courses/${ID}/access`, ([c = '']) => `${studio(c)}/publish`],
  [`/dash/courses/${ID}/curriculum`, ([c = '']) => `${studio(c)}/content`],
  [`/dash/courses/${ID}/collaboration`, ([c = '']) => `${studio(c)}/team`],
  [`/dash/courses/${ID}/gradebook`, ([c = '']) => `${studio(c)}/gradebook`],
  [`/dash/courses/${ID}/learners`, ([c = '']) => `${studio(c)}/learners`],
  [`/dash/courses/${ID}/review`, ([c]) => withQuery('/teach', { course: id(c) })],
  [`/dash/courses/${ID}/activity/${ID}/studio`, ([c = '', a]) => `${studio(c)}/activities/${id(a)}/edit`],
  [
    `/dash/courses/${ID}/activity/${ID}/review`,
    ([c = '', a], query) => {
      const submission = query.get('submission')
      return `${studio(c)}/activities/${id(a)}/submissions${submission ? `/${id(submission)}` : ''}`
    },
  ],
  ['/dash/user-account/settings(?:/general)?', () => '/settings'],
  ['/dash/user-account/settings/profile', () => '/settings/profile'],
  ['/dash/user-account/settings/security', () => '/settings/security'],
  ['/dash/user-account/settings/gamification', () => '/settings/notifications'],
]
const RULES = PATHS.map(([path, to]) => [new RegExp(`^${path}/?$`, 'i'), to] as const)

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(path, 'http://legacy.invalid')
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value)
  return url.pathname + url.search
}

/** The old sign-in return path, itself in the old shape: its new address (or none when it has no equivalent). */
function returnTo(query: URLSearchParams): string | null {
  const value = query.get('returnTo')
  if (!value?.startsWith('/') || value.startsWith('//')) return null
  const target = legacyTarget(value)
  return typeof target === 'string' ? target : value
}

/**
 * Where an old URL (path and query) lives now: a path, an `/assessments/<id>` link to resolve, or null (not an old
 * shape: the router answers it, a 404 when it knows no such page). Paths web-2 shares unprefixed are not old shapes.
 */
export function legacyTarget(href: string): string | AssessmentLink | null {
  const url = new URL(href, 'http://legacy.invalid')
  const prefixed = LOCALE_PREFIX.test(url.pathname)
  const path = url.pathname.replace(LOCALE_PREFIX, '') || '/'
  const assessment = /^\/assessments\/([\w-]+)\/?$/i.exec(path)
  if (assessment) return { assessment: id(assessment[1]), review: url.searchParams.get('review') }
  for (const [pattern, to] of RULES) {
    const match = pattern.exec(path)
    if (!match) continue
    const target = to(match.slice(1), url.searchParams)
    // Unprefixed, a path web-2 has itself (/login, /search, /courses) is its page, not an old link.
    return prefixed || new URL(target, url).pathname !== url.pathname ? target : null
  }
  return null
}
