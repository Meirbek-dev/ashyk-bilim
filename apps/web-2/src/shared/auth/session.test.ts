import { isRedirect } from '@tanstack/react-router'
import { describe, expect, test } from 'vite-plus/test'

import { currentSessionQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'

import { requireGuest, sessionOptions } from './session'

describe('sessionOptions', () => {
  // Login, logout and profile edits invalidate or write currentSessionQueryKey(): the root route must read the same.
  test('uses the generated session key', () => {
    expect(sessionOptions().queryKey).toEqual(currentSessionQueryKey())
  })
})

describe('requireGuest', () => {
  const session = { user: { language: 'ru' as const } }
  const target = (search: Record<string, unknown>) => {
    try {
      requireGuest({ context: { session }, location: { href: '/login', search } })
    } catch (thrown) {
      if (isRedirect(thrown)) return thrown.options.href
    }
    return null
  }

  test('B-AUTH-05 a signed-in visitor goes on to a safe ?redirect (the Google return), else /home', () => {
    expect(target({ redirect: '/collections?q=a' })).toBe('/collections?q=a')
    expect(target({ redirect: '//evil.example' })).toBe('/home')
    expect(target({})).toBe('/home')
    expect(requireGuest({ context: { session: null }, location: { href: '/login' } })).toBeUndefined()
  })
})
