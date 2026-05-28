import { describe, expect, it } from 'vitest'

import { getAvatarInitials, normalizeAvatarUrl, resolveAvatarUrl } from '@/services/media/avatar'

process.env['NEXT_PUBLIC_SITE_URL'] = 'https://app.test'
process.env['NEXT_PUBLIC_API_URL'] = 'https://api.test'
process.env['NEXT_PUBLIC_MEDIA_URL'] = 'https://media.test/static/'

describe('avatar URL normalization', () => {
  it('proxies Google profile image URLs through the app', () => {
    const googleUrl = 'https://lh3.googleusercontent.com/a/ACg8ocSample=s96-c'

    expect(normalizeAvatarUrl(googleUrl)).toBe(`/api/avatar?url=${encodeURIComponent(googleUrl)}`)
  })

  it('extracts and proxies Google URLs embedded in backend avatar paths', () => {
    const googleUrl = 'https://lh3.googleusercontent.com/a/ACg8ocSample=s96-c'
    const wrappedUrl = `http://localhost:3000/content/users/user-1/avatars/${googleUrl}`

    expect(normalizeAvatarUrl(wrappedUrl)).toBe(`/api/avatar?url=${encodeURIComponent(googleUrl)}`)
  })

  it('keeps local avatar URLs unchanged', () => {
    expect(normalizeAvatarUrl('/content/users/user-1/avatars/avatar.webp')).toBe(
      '/content/users/user-1/avatars/avatar.webp',
    )
  })

  it('does not proxy unsupported external hosts', () => {
    const externalUrl = 'https://example.com/avatar.png'

    expect(normalizeAvatarUrl(externalUrl)).toBe(externalUrl)
  })

  it('resolves stored avatar filenames from the user media directory', () => {
    expect(
      resolveAvatarUrl({
        user: {
          user_uuid: 'user-1',
          avatar_image: 'avatar.webp',
        },
      }),
    ).toBe('https://media.test/static/content/users/user-1/avatars/avatar.webp')
  })

  it('keeps public fallback paths out of the media directory', () => {
    expect(
      resolveAvatarUrl({
        avatarUrl: '/empty_avatar.avif',
        user: { user_uuid: 'user-1' },
      }),
    ).toBe('/empty_avatar.avif')
  })

  it('creates initials from names before username fallback', () => {
    expect(
      getAvatarInitials({
        first_name: 'Ada',
        last_name: 'Lovelace',
        username: 'ada',
      }),
    ).toBe('AL')
    expect(getAvatarInitials({ username: 'student' })).toBe('S')
  })
})
