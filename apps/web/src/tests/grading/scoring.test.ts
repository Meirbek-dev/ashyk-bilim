import { describe, expect, it } from 'vite-plus/test'
import { calculateItemPercent, roundScoreInput, sumScores } from '@/features/grading/domain'
import type { GradedItem } from '@/features/grading/domain'

describe('sumScores', () => {
  it('keeps three 33.33 items at exactly 99.99 - the same precision as the maximum', () => {
    const items = [33.33, 33.33, 33.33]
    const total = sumScores(items)
    expect(total).toBe(99.99)
    // The review form used to render `toFixed(1)` → "100.0 / 99.99"; the raw
    // hundredths value is what both sides of the fraction now show.
    expect(String(total)).toBe('99.99')
    expect((99.99).toFixed(1)).toBe('100.0')
  })

  it('sums raw item scores and rounds once - per-item cents rounding inflated 150 × 0.6667 to 100.5', () => {
    const items = Array.from({ length: 150 }, () => 0.6667)
    expect(sumScores(items)).toBe(100.01)
    expect(sumScores(Array.from({ length: 150 }, () => 100 / 150))).toBe(100)
  })

  it('rounds to hundredths so binary-float drift cannot show in a total', () => {
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
// UX-226: a migrated 150-item breakdown seeded `0.6666666666666667` into the inputs.
describe('roundScoreInput', () => {
  it('shows a seed at hundredths and leaves blanks alone', () => {
    expect(roundScoreInput('0.6666666666666667')).toBe('0.67')
    expect(roundScoreInput('50')).toBe('50')
    expect(roundScoreInput('')).toBe('')
  })
})
