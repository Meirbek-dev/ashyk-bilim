import { expect, test } from 'vite-plus/test'
import { matchesFailure } from '../e2e/fixtures/http-failures'

test('unexpected 4xx and 5xx fail page health even when a different endpoint is expected to fail', () => {
  const failures = [{ path: /^\/api\/v2\/auth\/login$/, statuses: [401] }]
  expect(matchesFailure(failures, 'https://stand.test/api/v2/auth/login', 401)).toBe(true)
  expect(matchesFailure(failures, 'https://stand.test/api/v2/auth/login', 500)).toBe(false)
  expect(matchesFailure(failures, 'https://stand.test/api/v2/courses', 401)).toBe(false)
  expect(matchesFailure(failures, 'https://stand.test/missing.js', 404)).toBe(false)
})

test('guest session and shared stream limits permit only their expected statuses', () => {
  expect(matchesFailure([], 'https://stand.test/api/v2/auth/session', 401)).toBe(true)
  expect(matchesFailure([], 'https://stand.test/api/v2/auth/session', 500)).toBe(false)
  expect(matchesFailure([], 'https://stand.test/api/v2/me/events', 429)).toBe(true)
  expect(matchesFailure([], 'https://stand.test/api/v2/me/events', 403)).toBe(false)
})

test('an explicit outage matches query strings and does not depend on regexp state', () => {
  const failures = [{ path: /^\/api\/v2\/code\/runner$/g, statuses: [503] }]
  for (let n = 0; n < 2; n++)
    expect(matchesFailure(failures, 'https://stand.test/api/v2/code/runner?retry=1', 503)).toBe(true)
  expect(matchesFailure([], 'https://stand.test/api/v2/code/runner', 503)).toBe(false)
})

test('an intentional network abort permits only the declared endpoint', () => {
  const failures = [{ path: /^\/api\/v2\/me\/events$/, statuses: [0] }]
  expect(matchesFailure(failures, 'https://stand.test/api/v2/me/events', 0)).toBe(true)
  expect(matchesFailure([], 'https://stand.test/api/v2/me/events', 0)).toBe(false)
  expect(matchesFailure(failures, 'https://stand.test/api/v2/courses', 0)).toBe(false)
})
