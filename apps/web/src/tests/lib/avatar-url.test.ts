import { describe, expect, it } from 'vite-plus/test'

import { getAvatarInitials, getUserDisplayName, normalizeAvatarUrl, resolveAvatarUrl } from '@/services/media/avatar'

process.env['NEXT_PUBLIC_SITE_URL'] = 'https://app.test'
process.env['NEXT_PUBLIC_API_URL'] = 'https://api.test/api/v2/'
process.env['NEXT_PUBLIC_MEDIA_URL'] = 'https://media.test/static/'

describe('avatar URL normalization (v2 storage keys)', () => {
  it('proxies Google profile image URLs through the app', () => {
    const googleUrl = 'https://lh3.googleusercontent.com/a/ACg8ocSample=s96-c'

    expect(normalizeAvatarUrl(googleUrl)).toBe(`/api/avatar?url=${encodeURIComponent(googleUrl)}`)
  })

  it('keeps local avatar URLs unchanged', () => {
    expect(normalizeAvatarUrl('/content/avatars/u1/avatar.webp')).toBe('/content/avatars/u1/avatar.webp')
  })

  it('does not proxy unsupported external hosts', () => {
    const externalUrl = 'https://example.com/avatar.png'

    expect(normalizeAvatarUrl(externalUrl)).toBe(externalUrl)
  })

  it('resolves avatar storage keys through the public /content route', () => {
    expect(
      resolveAvatarUrl({
        user: { avatar_key: 'avatars/user-1/avatar.webp' },
      }),
    ).toBe('https://media.test/static/content/avatars/user-1/avatar.webp')
  })

  it('falls back to the default avatar without a key', () => {
    expect(resolveAvatarUrl({ user: { avatar_key: null, username: 'ada' } })).toBe('/empty_avatar.avif')
    expect(resolveAvatarUrl({ predefinedAvatar: 'empty', user: { avatar_key: 'x' } })).toBe('/empty_avatar.avif')
  })

  it('keeps public fallback paths and browser previews as-is', () => {
    expect(resolveAvatarUrl({ avatarUrl: '/empty_avatar.avif', user: { avatar_key: 'k' } })).toBe('/empty_avatar.avif')
    expect(resolveAvatarUrl({ avatarUrl: 'blob:https://app.test/123' })).toBe('blob:https://app.test/123')
  })

  it('creates initials from the display name before the username fallback', () => {
    expect(getAvatarInitials({ display_name: 'Ada Lovelace', username: 'ada' })).toBe('AL')
    expect(getAvatarInitials({ display_name: 'Ada', username: 'ada' })).toBe('A')
    expect(getAvatarInitials({ username: 'student' })).toBe('S')
    expect(getAvatarInitials(null, 'ai')).toBe('AI')
  })

  it('prefers display_name and falls back to username', () => {
    expect(getUserDisplayName({ display_name: 'Ada Lovelace', username: 'ada' })).toBe('Ada Lovelace')
    expect(getUserDisplayName({ display_name: '  ', username: 'ada' })).toBe('ada')
    expect(getUserDisplayName(null, 'Anonymous')).toBe('Anonymous')
  })
})
