import { describe, expect, test } from 'vite-plus/test'

import type { SessionSummary } from '#/shared/api/gen/types.gen'

import { avatarProblem, deviceLabel, orderSessions, profileLocale, readSwitches, startTheme } from './settings'

const MB = 1024 * 1024

const session = (handle: string, current: boolean, seen: number): SessionSummary => ({
  handle,
  current,
  last_seen_unix: seen,
  created_at_unix: 0,
  ip: null,
  user_agent: null,
})

describe('settings model', () => {
  test('B-SET-03 a photo that is not an image or is over 5 MB is refused before any request', () => {
    expect(avatarProblem({ size: MB, type: 'image/png' })).toBeNull()
    expect(avatarProblem({ size: MB, type: 'image/avif' })).toBeNull()
    expect(avatarProblem({ size: 6 * MB, type: 'image/png' })).toContain('5')
    expect(avatarProblem({ size: 100, type: 'image/svg+xml' })).not.toBeNull()
    expect(avatarProblem({ size: 100, type: 'text/plain' })).not.toBeNull()
  })

  test('B-SET-08 sessions: this device first, then the most recently seen; the device comes from the user agent', () => {
    const ordered = orderSessions([session('old', false, 1), session('me', true, 2), session('new', false, 3)])
    expect(ordered.map(item => item.handle)).toEqual(['me', 'new', 'old'])

    const chromeWindows =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
    expect(deviceLabel(chromeWindows)).toBe('Chrome, Windows')
    expect(deviceLabel(`${chromeWindows} Edg/140.0`)).toBe('Edge, Windows')
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1',
      ),
    ).toBe('Safari, iOS')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36')).toBe(
      'Chrome, Android',
    )
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox, Linux')
    expect(deviceLabel('curl/8.21.0')).toBeNull()
    expect(deviceLabel(null)).toBeNull()
  })

  test('B-SET-11 the picker starts on the profile theme only when it is a shipped one (BUG-365)', () => {
    const slugs = ['modern-minimal', 't3-chat']
    expect(startTheme('t3-chat', 'modern-minimal', slugs)).toBe('t3-chat')
    expect(startTheme('legacy-gone', 'modern-minimal', slugs)).toBe('modern-minimal')
    expect(startTheme(null, 't3-chat', slugs)).toBe('t3-chat')
  })

  test('B-SET-12 the interface language is saved as the profile locale tag', () => {
    expect(profileLocale('ru')).toBe('ru-RU')
    expect(profileLocale('kk')).toBe('kk-KZ')
    expect(profileLocale('en')).toBe('en-US')
  })

  test('B-SET-13 the switches read the stored preferences and are on when unset', () => {
    expect(readSwitches({})).toEqual({ xpGain: true, showOnLeaderboard: true })
    expect(readSwitches({ notifications: { xpGain: false }, privacy: { showOnLeaderboard: false } })).toEqual({
      xpGain: false,
      showOnLeaderboard: false,
    })
    expect(readSwitches({ notifications: { xpGain: null }, privacy: 'garbage' })).toEqual({
      xpGain: true,
      showOnLeaderboard: true,
    })
  })
})
