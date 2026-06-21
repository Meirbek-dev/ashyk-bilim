import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { cloneJsonValue } from '@/lib/json-clone'

describe('cloneJsonValue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to JSON cloning when structuredClone is unavailable', () => {
    vi.stubGlobal('structuredClone', undefined)

    const original = {
      answers: {
        item_one: { kind: 'OPEN_TEXT', text: 'hello' },
      },
    }

    const cloned = cloneJsonValue(original)

    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.answers).not.toBe(original.answers)
  })
})
