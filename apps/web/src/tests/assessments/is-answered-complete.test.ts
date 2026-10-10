import { describe, expect, it } from 'vite-plus/test'

import { isAnswered, type ItemBody } from '@/features/assessments/domain/items'

describe('isAnswered', () => {
  it('needs a pair for every left element of a matching question', () => {
    const body: ItemBody = {
      kind: 'MATCHING',
      prompt: '',
      pairs: [],
      left: ['a', 'b', 'c'].map(text => ({ id: text, text })),
      right: ['1', '2', '3'].map(text => ({ id: text, text })),
    }
    const two = {
      kind: 'MATCHING' as const,
      matches: [
        { left: 'a', right: '1' },
        { left: 'b', right: '2' },
      ],
    }
    expect(isAnswered(two, body)).toBe(false)
    expect(isAnswered({ ...two, matches: [...two.matches, { left: 'c', right: '3' }] }, body)).toBe(true)
  })

  it('needs every required field of a form', () => {
    const body: ItemBody = {
      kind: 'FORM',
      prompt: '',
      fields: [
        { id: 'city', label: 'City', field_type: 'text', required: true },
        { id: 'age', label: 'Age', field_type: 'number', required: false },
      ],
    }
    expect(isAnswered({ kind: 'FORM', values: { age: '20' } }, body)).toBe(false)
    expect(isAnswered({ kind: 'FORM', values: { city: 'Astana' } }, body)).toBe(true)
  })
})
