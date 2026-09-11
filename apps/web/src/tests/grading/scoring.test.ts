import { describe, expect, it } from 'vitest'
import { calculateItemPercent, sumScores } from '@/features/grading/domain'
import type { GradedItem } from '@/features/grading/domain'

describe('sumScores', () => {
  it('keeps three 33.33 items at exactly 99.99 — the same precision as the maximum', () => {
    const items = [33.33, 33.33, 33.33]
    const total = sumScores(items)
    expect(total).toBe(99.99)
    // The review form used to render `toFixed(1)` → "100.0 / 99.99"; the raw
    // hundredths value is what both sides of the fraction now show.
    expect(String(total)).toBe('99.99')
    expect((99.99).toFixed(1)).toBe('100.0')
  })

  it('sums on integer hundredths so binary-float drift cannot push a total past its maximum', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumScores([0.1, 0.2])).toBe(0.3)
    expect(sumScores([10, 20.5, 69.5])).toBe(100)
    expect(sumScores([])).toBe(0)
  })
})

describe('calculateItemPercent', () => {
  it('reports 100% when every item is at its (fractional) maximum', () => {
    const items = ['a', 'b', 'c'].map(id => ({ item_id: id, score: 33.33, max_score: 33.33 })) as GradedItem[]
    expect(calculateItemPercent(items, {})).toBe(100)
  })
})
