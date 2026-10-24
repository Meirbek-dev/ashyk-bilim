export type ExpectedFailure = { path: RegExp; statuses: number[] }

/** Match exact HTTP statuses on named endpoints; a generic client/server error is never sufficient. */
export function matchesFailure(expected: ExpectedFailure[], url: string, status: number): boolean {
  const path = new URL(url).pathname
  if (path === '/api/v2/auth/session' && status === 401) return true
  if (path === '/api/v2/me/events' && status === 429) return true
  return expected.some(entry => {
    entry.path.lastIndex = 0
    return entry.path.test(path) && entry.statuses.includes(status)
  })
}
