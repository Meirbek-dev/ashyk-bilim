import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { learningsSchema, learningsText, parseLearnings } from './learnings'

describe('learnings', () => {
  test("B-CST-41 one point per line; a leading emoji is the point's emoji; blank lines go", () => {
    expect(parseLearnings('🚀 Писать циклы\n\n  Читать код  \n✅ Тесты')).toEqual([
      { emoji: '🚀', text: 'Писать циклы' },
      { text: 'Читать код' },
      { emoji: '✅', text: 'Тесты' },
    ])
    expect(
      learningsText([
        { emoji: '🚀', text: 'Писать циклы' },
        { emoji: null, text: 'Читать код' },
      ]),
    ).toBe('🚀 Писать циклы\nЧитать код')
    expect(parseLearnings('1 шаг')).toEqual([{ text: '1 шаг' }])
  })

  test('B-CST-41 at most 30 points of at most 300 characters each', () => {
    expect(v.is(learningsSchema, { learnings: Array.from({ length: 30 }, (_, i) => `p${i}`).join('\n') })).toBe(true)
    expect(v.is(learningsSchema, { learnings: Array.from({ length: 31 }, (_, i) => `p${i}`).join('\n') })).toBe(false)
    expect(v.is(learningsSchema, { learnings: 'я'.repeat(300) })).toBe(true)
    expect(v.is(learningsSchema, { learnings: 'я'.repeat(301) })).toBe(false)
  })
})
