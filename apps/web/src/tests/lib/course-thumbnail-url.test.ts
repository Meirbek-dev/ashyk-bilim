import { describe, expect, it } from 'vite-plus/test'

import { getCourseThumbnailMediaDirectory } from '@/services/media/media'

process.env['NEXT_PUBLIC_SITE_URL'] = 'https://app.test'
process.env['NEXT_PUBLIC_API_URL'] = 'https://api.test'
process.env['NEXT_PUBLIC_MEDIA_URL'] = 'https://media.test/static/'

describe('course thumbnail URL resolution', () => {
  it('resolves uploaded thumbnail filenames from the course media directory', () => {
    expect(getCourseThumbnailMediaDirectory('course_123', 'thumbnail.webp')).toBe(
      'https://media.test/static/content/platform/courses/course_123/thumbnails/thumbnail.webp',
    )
  })

  it('keeps empty thumbnail placeholders out of the course media directory', () => {
    expect(getCourseThumbnailMediaDirectory('course_123', '')).toBe('/empty_thumbnail.avif')
    expect(getCourseThumbnailMediaDirectory('course_123', '   ')).toBe('/empty_thumbnail.avif')
    expect(getCourseThumbnailMediaDirectory('course_123', 'empty_thumbnail.avif')).toBe('/empty_thumbnail.avif')
    expect(getCourseThumbnailMediaDirectory('course_123', '/empty_thumbnail.avif')).toBe('/empty_thumbnail.avif')
    expect(getCourseThumbnailMediaDirectory('', 'thumbnail.webp')).toBe('/empty_thumbnail.avif')
  })
})
