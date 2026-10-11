import { describe, expect, test } from 'vite-plus/test'

import { contentUrl } from './content-url'

describe('contentUrl', () => {
  test('a storage key is served under /content/', () => {
    expect(contentUrl('avatars/u1/a.webp')).toBe('/content/avatars/u1/a.webp')
  })

  test('a migrated Google photo URL is used as is', () => {
    const google = 'https://lh3.googleusercontent.com/a/ACg8oc=s96-c'
    expect(contentUrl(google)).toBe(google)
  })
})
