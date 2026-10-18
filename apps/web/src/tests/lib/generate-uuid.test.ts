import { describe, expect, it } from 'vite-plus/test'

import { generateUUID } from '@/lib/utils'

describe('generateUUID', () => {
  it('returns distinct v4 UUIDs (server and browser share the Web Crypto path)', () => {
    const a = generateUUID()
    expect(a).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    expect(generateUUID()).not.toBe(a)
  })
})
