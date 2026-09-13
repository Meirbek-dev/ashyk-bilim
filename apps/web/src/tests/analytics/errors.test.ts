import { describe, expect, it } from 'vite-plus/test'

import { describeAnalyticsError } from '@/lib/analytics/errors'
import { APIError } from '@/lib/api/assertSuccess'

const catalog: Record<string, string> = {
  'pages.scopeDenied': 'scope denied',
  'pages.invalidFilters': 'invalid filters',
  'codes.not-found': 'not found (ru)',
  'codes.internal': 'internal (ru)',
}
const t = Object.assign((key: string) => catalog[key] ?? key, { has: (key: string) => key in catalog })

describe('describeAnalyticsError', () => {
  it.each([
    [403, 'forbidden', 'requested courses are outside the analytics scope: 1', 'scope denied'],
    [422, 'validation-failed', 'Validation failed', 'invalid filters'],
    [404, 'not-found', 'course not found', 'not found (ru)'],
    [500, 'internal', 'database host exploded', 'internal (ru)'],
    [502, 'HTTP_502', '<html>Bad gateway</html>', 'fallback'],
  ])('%s %s never renders the server detail', (status, code, message, expected) => {
    const error = new APIError({ status, code, message })
    expect(describeAnalyticsError(error, t, t, 'fallback')).toBe(expected)
  })

  it('uses the fallback for non-API errors', () => {
    expect(describeAnalyticsError(new Error('zod dump'), t, t, 'fallback')).toBe('fallback')
  })
})
