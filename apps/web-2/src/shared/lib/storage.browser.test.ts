import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { storageItem } from './storage'

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
