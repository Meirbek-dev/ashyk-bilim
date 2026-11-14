import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { cookieItem, storageItem } from './storage'

describe('storageItem (real Chromium storage)', () => {
  test('round-trips a typed value', () => {
    const item = storageItem('ab.test-roundtrip', v.object({ at: v.number() }))
    item.set({ at: 42 })
    expect(item.get()).toEqual({ at: 42 })
  })

  test('a value of the wrong shape or not JSON reads as null', () => {
    localStorage.setItem('ab.test-shape', '{"at":"x"}')
    sessionStorage.setItem('ab.test-json', 'not json')
    expect(storageItem('ab.test-shape', v.object({ at: v.number() })).get()).toBeNull()
    expect(storageItem('ab.test-json', v.number(), 'session').get()).toBeNull()
  })
})

describe('cookieItem (real Chromium cookies)', () => {
  test('a malformed percent-encoded cookie falls back instead of crashing preferences', () => {
    const mode = cookieItem('ab_test_malformed', v.picklist(['light', 'dark']))
    document.cookie = 'ab_test_malformed=%E0%A4%A; path=/'
    try {
      expect(mode.get()).toBeNull()
      mode.set('light')
      expect(mode.get()).toBe('light')
    } finally {
      document.cookie = 'ab_test_malformed=; path=/; max-age=0'
    }
  })

  test('round-trips a value and reads a value outside the schema as null', () => {
    const mode = cookieItem('ab_test_mode', v.picklist(['light', 'dark']))
    mode.set('dark')
    expect(mode.get()).toBe('dark')
    document.cookie = 'ab_test_mode=sepia; path=/'
    expect(mode.get()).toBeNull()
  })
})
