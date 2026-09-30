import { describe, expect, it } from 'vite-plus/test'

import { getContentUrl, getCourseThumbnailUrl, getPlatformThumbnailImage } from '@/services/media/media'

process.env['NEXT_PUBLIC_SITE_URL'] = 'https://app.test'
process.env['NEXT_PUBLIC_API_URL'] = 'https://api.test/api/v2/'
process.env['NEXT_PUBLIC_MEDIA_URL'] = 'https://media.test/static/'

describe('public media URL resolution (v2 storage keys)', () => {
  it('serves storage keys from the anonymous /content route', () => {
    expect(getContentUrl('courses/c1/thumbnails/thumb.webp')).toBe(
      'https://media.test/static/content/courses/c1/thumbnails/thumb.webp',
    )
    expect(getContentUrl('/leading/slash.png')).toBe('https://media.test/static/content/leading/slash.png')
  })

  it('passes absolute URLs and browser previews through', () => {
    expect(getContentUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png')
    expect(getContentUrl('blob:https://app.test/1')).toBe('blob:https://app.test/1')
  })

  it('yields null for missing keys', () => {
    expect(getContentUrl(null)).toBeNull()
    expect(getContentUrl('   ')).toBeNull()
  })

  it('falls back to the empty course thumbnail without a key', () => {
    expect(getCourseThumbnailUrl(null)).toBe('/empty_thumbnail.avif')
    expect(getCourseThumbnailUrl('courses/c1/thumb.webp')).toBe(
      'https://media.test/static/content/courses/c1/thumb.webp',
    )
  })

  it('falls back to the bundled platform thumbnail without a key', () => {
    expect(getPlatformThumbnailImage(null)).toMatch(/^https:\/\/app\.test\//u)
    expect(getPlatformThumbnailImage('platform/thumb.webp')).toBe(
      'https://media.test/static/content/platform/thumb.webp',
    )
  })
})
