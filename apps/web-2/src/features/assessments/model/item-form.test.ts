import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { AssessmentItem, ItemBody, MediaRef } from '#/shared/api/gen/types.gen'

import { changedFields, itemForm, itemFormSchema, itemPatch } from './item-form'
import { withVariant } from './items'

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

const picture: MediaRef = { upload_id: '0193a9c2-6f7e-7c3a-9d2e-1f2a3b4c5d6e', width: 640, height: 480, alt: 'Схема' }
const optionPicture: MediaRef = { upload_id: '0193a9c2-6f7e-7c3a-9d2e-1f2a3b4c5d6f', width: 120, height: 80 }

const imported = (id: string, itemBody: ItemBody): AssessmentItem => ({
  id,
  body: itemBody,
  kind: itemBody.kind,
  max_score: 1,
  metadata: { difficulty: 'medium', draw_group: '2', estimated_minutes: null, section_label: null, tags: ['java'] },
  position: 29,
  title: 'Q 29',
  assessment_version: 4,
  source: { file: 'Java_EXAM_2026_2.xlsx', row: 29 },
})

// As the server sends them: an option without a picture has no `media` key at all.
const importedChoice = imported('c', {
  kind: 'choice',
  variant: 'single_choice',
  multiple: false,
  prompt: 'List<String> a = new ArrayList<>();\n    a.add("*x*");',
  prompt_format: 'plain',
  media: [picture],
  explanation: null,
  options: [
    { id: 'a', text: '1', is_correct: true, media: optionPicture },
    { id: 'b', text: '2', is_correct: false },
  ],
})
const importedShort = imported('s', {
  kind: 'open_text',
  prompt: '2 + 2 = ?',
  prompt_format: 'plain',
  media: [picture],
  min_words: null,
  rubric: null,
  short_answer: true,
  accepted_answers: ['4', 'four'],
  case_sensitive: true,
})
const importedMatching = imported('m', {
  kind: 'matching',
  prompt: 'Match',
  prompt_format: 'plain',
  media: [picture],
  explanation: null,
  pairs: [
    { left: 'int', right: 'number' },
    { left: 'void', right: null },
  ],
  distractors: ['char'],
})

describe('an imported question survives the editor', () => {
  test('a valid form that sends back every new body field: pictures, plain format, short answer, null pairs', () => {
    for (const item of [importedChoice, importedShort, importedMatching]) {
      const form = itemForm(item)
      expect(v.is(itemFormSchema, form)).toBe(true)
      const patch = itemPatch(form)
      expect(patch.body).toMatchObject(item.body)
      expect(patch.metadata).toEqual(item.metadata)
      // Opened and left untouched: nothing to send.
      expect(changedFields(patch, itemPatch(itemForm(item)))).toEqual({})
    }
  })

  test('an option without a picture has no `media` key (the contract makes it optional)', () => {
    const form = itemForm(importedChoice)
    expect(form.body.kind === 'choice' && form.body.options?.map(option => option.media)).toEqual([
      optionPicture,
      undefined,
    ])
  })

  test('editing the prompt or the variant keeps the pictures and the format', () => {
    const form = itemForm(importedChoice)
    if (form.body.kind !== 'choice') throw new Error('choice expected')
    const edited = { ...form, body: { ...form.body, prompt: 'Changed' } }
    const patch = changedFields(itemPatch(form), itemPatch(edited))
    expect(patch.body).toMatchObject({ prompt: 'Changed', prompt_format: 'plain', media: [picture] })
    expect(patch.metadata).toBeUndefined()
    const multiple = withVariant(form.body, 'multiple_choice')
    expect(multiple).toMatchObject({ prompt_format: 'plain', media: [picture] })
    expect(multiple.options?.[0]?.media).toEqual(optionPicture)
  })

  test('the draw group is typed text: trimmed, blank is none, sent as the whole metadata', () => {
    const form = itemForm(importedShort)
    expect(form.draw_group).toBe('2')
    const patch = changedFields(itemPatch(form), itemPatch({ ...form, draw_group: ' 101 ' }))
    expect(patch).toEqual({ metadata: { ...importedShort.metadata, draw_group: '101' } })
    expect(itemPatch({ ...form, draw_group: '  ' }).metadata?.draw_group).toBeNull()
    expect(v.is(itemFormSchema, { ...form, draw_group: 'x'.repeat(33) })).toBe(false)
  })
})
