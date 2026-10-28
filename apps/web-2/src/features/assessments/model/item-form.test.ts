import { expect, test } from 'vite-plus/test'

import type { ItemBody } from '#/shared/api/gen/types.gen'

import { changedFields } from './item-form'

const body: ItemBody = { kind: 'open_text', prompt: 'Explain', min_words: null, rubric: null }
const saved = { title: 'Q', max_score: 1, body }

test('B-ASM-10 an item save carries only what differs from the saved item', () => {
  expect(changedFields(saved, { ...saved, max_score: 3 })).toEqual({ max_score: 3 })
  expect(changedFields(saved, { ...saved, title: 'Q2' })).toEqual({ title: 'Q2' })
  expect(changedFields(saved, { ...saved, body: { ...body, prompt: 'Why' } })).toEqual({
    body: { ...body, prompt: 'Why' },
  })
  // An equal body built anew is no change.
  expect(changedFields(saved, { ...saved, body: { ...body } })).toEqual({})
})
