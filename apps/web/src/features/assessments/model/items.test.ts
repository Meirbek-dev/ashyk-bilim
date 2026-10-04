import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { AssessmentItem, ItemBody } from '#/shared/api/gen/types.gen'

import { itemForm, itemFormSchema, itemPatch } from './item-form'
import {
  copyItem,
  inOrder,
  itemKindOf,
  newItem,
  newItemKinds,
  openItem,
  totalPoints,
  withVariant,
  type Choice,
} from './items'
import { isAssessmentType } from './route'

const metadata = { difficulty: null, estimated_minutes: null, section_label: null }
const item = (id: string, body: ItemBody, extra: Partial<AssessmentItem> = {}): AssessmentItem => ({
  id,
  body,
  kind: body.kind,
  max_score: 1,
  metadata,
  position: 1,
  title: `Q ${id}`,
  assessment_version: 1,
  ...extra,
})
const choice = (variant: Choice['variant'], correct: boolean[]): Choice => ({
  kind: 'choice',
  variant,
  multiple: variant === 'multiple_choice',
  prompt: 'p',
  explanation: null,
  options: correct.map((is_correct, at) => ({ id: `o${at}`, text: `t${at}`, is_correct })),
})

describe('builder', () => {
  test('B-ASM-01 the header sums the points; a choice shows its variant, a legacy row its `multiple`', () => {
    expect(totalPoints([{ max_score: 1.5 }, { max_score: 2 }])).toBe(3.5)
    expect(itemKindOf({ body: choice('true_false', [true, false]) })).toBe('true_false')
    expect(itemKindOf({ body: { ...choice(null, [true]), multiple: true } })).toBe('multiple_choice')
    expect(itemKindOf({ body: { kind: 'open_text', min_words: null, rubric: null } })).toBe('open_text')
  })

  test('B-ASM-02 quiz and exam offer the six question kinds, a code challenge only code', () => {
    expect(isAssessmentType('quiz') && isAssessmentType('exam') && isAssessmentType('code_challenge')).toBe(true)
    expect(isAssessmentType('dynamic')).toBe(false)
    expect(newItemKinds('quiz')).toEqual(newItemKinds('exam'))
    expect(newItemKinds('quiz')).toHaveLength(6)
    expect(newItemKinds('code_challenge')).toEqual(['code'])
  })

  test('B-ASM-02 a new question: one point, the title given, an empty body of its kind', () => {
    const single = newItem('single_choice', 'Вопрос 1')
    expect(single).toMatchObject({
      title: 'Вопрос 1',
      max_score: 1,
      body: { kind: 'choice', variant: 'single_choice' },
    })
    expect(single.body.kind === 'choice' && single.body.options).toHaveLength(2)
    expect(newItem('true_false', 't').body).toMatchObject({ options: [{ id: 'true' }, { id: 'false' }] })
    expect(newItem('matching', 't').body).toMatchObject({ kind: 'matching', pairs: [{ left: '', right: '' }] })
    expect(newItem('form', 't').body).toMatchObject({ kind: 'form', fields: [{ field_type: 'text', required: true }] })
    expect(newItem('open_text', 't').body).toEqual({ kind: 'open_text', prompt: '', min_words: null, rubric: null })
  })

  test('B-ASM-03 the open question is the one in the URL, else the first', () => {
    const items = [item('a', choice('single_choice', [true])), item('b', choice('single_choice', [true]))]
    expect(openItem(items, 'b')?.id).toBe('b')
    expect(openItem(items, 'gone')?.id).toBe('a')
    expect(openItem(items, undefined)?.id).toBe('a')
    expect(openItem([], 'b')).toBeUndefined()
  })

  test('B-ASM-05 single answer keeps only the first correct; true/false gets its fixed pair; leaving it starts over', () => {
    const several = choice('multiple_choice', [false, true, true])
    const single = withVariant(several, 'single_choice')
    expect(single.options?.map(option => option.is_correct)).toEqual([false, true, false])
    expect(single.multiple).toBe(false)
    expect(withVariant(single, 'multiple_choice').multiple).toBe(true)
    const trueFalse = withVariant(several, 'true_false')
    expect(trueFalse.options?.map(option => option.id)).toEqual(['true', 'false'])
    const back = withVariant(trueFalse, 'single_choice')
    expect(back.options).toHaveLength(2)
    expect(back.options?.every(option => option.text === '' && !option.is_correct)).toBe(true)
  })
})

describe('builder: saving and order', () => {
  test('B-ASM-10 the form takes what the contract takes: title up to 500, points 0..10 000 (comma too)', () => {
    const form = itemForm(item('a', choice('single_choice', [true]), { max_score: 2 }))
    expect(form.points).toBe('2')
    expect(v.is(itemFormSchema, form)).toBe(true)
    expect(v.is(itemFormSchema, { ...form, points: '2,5' })).toBe(true)
    expect(itemPatch({ ...form, points: '2,5' }).max_score).toBe(2.5)
    expect(v.is(itemFormSchema, { ...form, points: '' })).toBe(false)
    expect(v.is(itemFormSchema, { ...form, points: '10001' })).toBe(false)
    expect(v.is(itemFormSchema, { ...form, points: 'abc' })).toBe(false)
    expect(v.is(itemFormSchema, { ...form, title: 'x'.repeat(501) })).toBe(false)
  })

  test('B-ASM-12 a copy keeps points, metadata and body', () => {
    const source = item('a', choice('single_choice', [true, false]), { max_score: 3 })
    const copy = copyItem(source, 'Q a (копия)')
    expect(copy).toMatchObject({ title: 'Q a (копия)', max_score: 3, metadata })
    expect(copy.body.kind === 'choice' && copy.body.options?.map(option => option.text)).toEqual(['t0', 't1'])
  })

  test('B-ASM-14 a dragged order renumbers the questions 1..n', () => {
    const items = ['a', 'b', 'c'].map((id, at) => item(id, choice('single_choice', [true]), { position: at + 1 }))
    const moved = inOrder(items, ['c', 'a', 'b'])
    expect(moved.map(row => [row.id, row.position])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })

  test('B-ASM-15 options and form fields get fresh ids when created and copied (BUG-199)', () => {
    const created = newItem('single_choice', 't').body
    const ids = created.kind === 'choice' ? (created.options ?? []).map(option => option.id) : []
    expect(new Set(ids).size).toBe(2)
    const source = item('a', choice('single_choice', [true, false]))
    const copy = copyItem(source, 'c').body
    const copied = copy.kind === 'choice' ? (copy.options ?? []).map(option => option.id) : []
    expect(copied.some(id => id === 'o0' || id === 'o1')).toBe(false)
    const form = item('f', { kind: 'form', prompt: 'p', fields: [{ id: 'x', label: 'L' }] })
    const formCopy = copyItem(form, 'c').body
    expect(formCopy.kind === 'form' && formCopy.fields?.[0]?.id).not.toBe('x')
    const tf = copyItem(item('t', choice('true_false', [true, false])), 'c').body
    expect(tf.kind === 'choice' && tf.options?.map(option => option.id)).toEqual(['o0', 'o1'])
  })
})
