import { describe, expect, test } from 'vite-plus/test'

import { contentPreviews, contentUrl } from './content-url'

describe('contentUrl', () => {
  test('a storage key is served under /content/', () => {
    expect(contentUrl('avatars/u1/a.webp')).toBe('/content/avatars/u1/a.webp')
  })

  test('a migrated Google photo URL is used as is', () => {
    const google = 'https://lh3.googleusercontent.com/a/ACg8oc=s96-c'
    expect(contentUrl(google)).toBe(google)
  })
})

describe('contentPreviews', () => {
  test('an avatar has its previews next to the key, smallest first', () => {
    expect(contentPreviews('avatar/0193', 'avatar')).toEqual({
      src: '/content/avatar/0193.w64',
      srcSet: '/content/avatar/0193.w64 64w, /content/avatar/0193.w192 192w',
    })
  })

  test('a course thumbnail has its card sizes', () => {
    expect(contentPreviews('course-thumbnail/01', 'course-thumbnail')?.srcSet).toBe(
      '/content/course-thumbnail/01.w320 320w, /content/course-thumbnail/01.w640 640w',
    )
  })

  test('no previews for a Google photo or a purpose without them', () => {
    expect(contentPreviews('https://lh3.googleusercontent.com/a/x', 'avatar')).toBeNull()
    expect(contentPreviews('block-image/01', 'block-image')).toBeNull()
  })
})
