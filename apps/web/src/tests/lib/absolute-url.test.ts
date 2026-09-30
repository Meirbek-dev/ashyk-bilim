import { describe, expect, it } from 'vite-plus/test'

import { getAbsoluteUrl } from '@/services/config/config'

process.env['NEXT_PUBLIC_SITE_URL'] = 'https://app.test'
process.env['NEXT_PUBLIC_API_URL'] = 'https://api.test/api/v2/'

// BUG-033a: `${getAbsoluteUrl('')}/course/x` produced `https://app.test//course/x`.
describe('getAbsoluteUrl', () => {
  it('returns the bare origin for an empty path so appended routes get one slash', () => {
    expect(getAbsoluteUrl('')).toBe('https://app.test')
    expect(`${getAbsoluteUrl('')}/course/c1/activity/a1`).toBe('https://app.test/course/c1/activity/a1')
  })

  it('still resolves real paths', () => {
    expect(getAbsoluteUrl('/course/c1')).toBe('https://app.test/course/c1')
    expect(getAbsoluteUrl('/')).toBe('https://app.test/')
  })
})
