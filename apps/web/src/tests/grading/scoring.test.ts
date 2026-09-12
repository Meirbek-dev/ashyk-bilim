import { describe, expect, it } from 'vitest'
import { calculateItemPercent, sumScores, toItemScale } from '@/features/grading/domain'
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

// Gauntlet F25: the grade save takes item scores on the item's own scale
// (`max_score` 1 on a 3-question exam), the breakdown shows them out of 33.33.
// Sending the breakdown value verbatim stored 33.33 / 1 × 33.33 = 1110.89.
describe('toItemScale', () => {
  it('converts a breakdown-scale score onto the item scale the API expects', () => {
    expect(toItemScale(33.33, 33.33, 1)).toBe(1)
    expect(toItemScale(20, 33.33, 1) * 33.33).toBeCloseTo(20, 6)
    expect(toItemScale(0, 33.33, 1)).toBe(0)
  })

  it('sends the typed value when the item scale is unknown (server stores it verbatim)', () => {
    expect(toItemScale(7, 33.33, undefined)).toBe(7)
    expect(toItemScale(7, 0, 1)).toBe(7)
  })
})
