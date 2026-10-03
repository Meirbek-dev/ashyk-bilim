import { describe, expect, test } from 'vite-plus/test'

import { isScoreInputInvalid, itemsPercent, parseScoreInput, roundScoreInput, sumScores, toItemScale } from './scoring'

describe('B-GRD-22 score rounding', () => {
  test('B-GRD-22 three 33.33 items stay 99.99, the same precision as the maximum', () => {
    expect(sumScores([33.33, 33.33, 33.33])).toBe(99.99)
  })

  test('B-GRD-22 sums raw scores and rounds once: per-item cents inflated 150 x 0.6667 to 100.5', () => {
    expect(sumScores(Array.from({ length: 150 }, () => 0.6667))).toBe(100.01)
    expect(sumScores(Array.from({ length: 150 }, () => 100 / 150))).toBe(100)
  })

  test('B-GRD-22 float drift never shows in a total', () => {
    expect(sumScores([0.1, 0.2])).toBe(0.3)
    expect(sumScores([10, 20.5, 69.5])).toBe(100)
    expect(sumScores([])).toBe(0)
  })

  test('B-GRD-22 a migrated seed shows at hundredths; blanks stay blank (UX-226)', () => {
    expect(roundScoreInput('0.6666666666666667')).toBe('0.67')
    expect(roundScoreInput('50')).toBe('50')
    expect(roundScoreInput('')).toBe('')
  })

  test('B-GRD-22 a breakdown share goes onto the item scale and back (Gauntlet F25)', () => {
    expect(toItemScale(33.33, 33.33, 1)).toBe(1)
    expect(toItemScale(20, 33.33, 1) * 33.33).toBeCloseTo(20, 6)
    expect(toItemScale(0, 33.33, 1)).toBe(0)
    expect(toItemScale(7, 33.33, undefined)).toBe(7)
    expect(toItemScale(7, 0, 1)).toBe(7)
  })

  test('B-GRD-12 the item total is 100 % when every item is at its fractional maximum', () => {
    expect(itemsPercent(['a', 'b', 'c'].map(() => ({ score: 33.33, max: 33.33 })))).toBe(100)
    expect(itemsPercent([{ score: 1, max: 3 }])).toBe(33.33)
    expect(itemsPercent([])).toBeNull()
  })
})

describe('B-GRD-12 score input', () => {
  test('B-GRD-12 takes a comma or a dot within 0..max, flags the rest', () => {
    expect(parseScoreInput('7,5', 10)).toBe(7.5)
    expect(parseScoreInput(' 3 ', 10)).toBe(3)
    expect(parseScoreInput('11', 10)).toBeNull()
    expect(parseScoreInput('-1', 10)).toBeNull()
    expect(parseScoreInput('abc')).toBeNull()
    expect(isScoreInputInvalid('   ')).toBe(false)
    expect(isScoreInputInvalid('101')).toBe(true)
  })
})
