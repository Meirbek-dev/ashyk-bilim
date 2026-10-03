import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { CodeBody } from '#/shared/api/gen/types.gen'

import { bodyChanged, codeBodyOf, codeForm, codeFormSchema, newTest, testCounts } from './body-form'

const stored: CodeBody = {
  prompt: 'Sum two numbers',
  languages: [71],
  starter_code: { '71': 'a, b = map(int, input().split())' },
  reference_solutions: { '71': 'print(sum(map(int, input().split())))' },
  constraints: ['1 <= a, b <= 100'],
  tests: [
    {
      id: 't1',
      description: null,
      input: '1 2',
      expected_output: '3',
      is_visible: true,
      weight: 1,
      match_mode: 'trimmed',
    },
  ],
  scoring_strategy: 'all_or_nothing',
  max_output_kb: 64,
  memory_limit_mb: 256,
  time_limit_seconds: 5,
}

describe('code item form', () => {
  test('B-COD-14 the statement round-trips; constraints are one per line', () => {
    const form = codeForm(stored)
    expect(form.constraints).toBe('1 <= a, b <= 100')
    const body = codeBodyOf({ ...form, constraints: ' a > 0 \n\n b > 0 ' }, stored)
    expect(body.constraints).toEqual(['a > 0', 'b > 0'])
    expect(body.prompt).toBe('Sum two numbers')
  })

  test('B-COD-15 languages, starter code and reference solutions are saved per language id', () => {
    const form = codeForm(stored)
    const body = codeBodyOf({ ...form, languages: [71, 63], starter: { ...form.starter, '63': '// js' } }, stored)
    expect(body.languages).toEqual([71, 63])
    expect(body.starter_code).toEqual({ '71': 'a, b = map(int, input().split())', '63': '// js' })
    expect(body.reference_solutions).toEqual(stored.reference_solutions)
  })

  test('B-COD-16 tests keep what the form does not edit; a new test is visible with weight 1', () => {
    const form = codeForm(stored)
    const added = newTest()
    const body = codeBodyOf(
      { ...form, tests: [...form.tests, { ...added, expected: '5', visible: false, weight: '2' }] },
      stored,
    )
    expect(body.tests?.[0]).toMatchObject({ id: 't1', match_mode: 'trimmed', description: null })
    expect(body.tests?.[1]).toMatchObject({ id: added.id, expected_output: '5', is_visible: false, weight: 2 })
    expect(body.scoring_strategy).toBe('all_or_nothing')
    expect(body.max_output_kb).toBe(64)
    expect(added).toMatchObject({ visible: true, weight: '1' })
    expect(testCounts(codeForm(body).tests)).toEqual({ visible: 1, hidden: 1 })
  })

  test('B-COD-16 a weight must be a whole number above zero', () => {
    const form = codeForm(stored)
    const weight = (value: string) =>
      v.safeParse(codeFormSchema, { ...form, tests: [{ ...form.tests[0], weight: value }] }).success
    expect(weight('3')).toBe(true)
    expect(weight('0')).toBe(false)
    expect(weight('1.5')).toBe(false)
    expect(weight('')).toBe(false)
  })

  test('B-COD-18 an untouched form is not a change; any edit is', () => {
    const form = codeForm(stored)
    expect(bodyChanged(form, stored)).toBe(false)
    expect(bodyChanged({ ...form, prompt: 'Sum three numbers' }, stored)).toBe(true)
    expect(bodyChanged({ ...form, tests: [] }, stored)).toBe(true)
    const sparse: CodeBody = { max_output_kb: null, memory_limit_mb: null, time_limit_seconds: null }
    expect(bodyChanged(codeForm(sparse), sparse)).toBe(false)
  })

  test('B-COD-17 limits are whole numbers from 1; blank means the sandbox default', () => {
    const form = codeForm(stored)
    expect(form).toMatchObject({ time: '5', memory: '256' })
    const valid = (time: string) => v.safeParse(codeFormSchema, { ...form, time }).success
    expect(valid('')).toBe(true)
    expect(valid('10')).toBe(true)
    expect(valid('0')).toBe(false)
    expect(valid('-1')).toBe(false)
    expect(codeBodyOf({ ...form, time: '', memory: ' 512 ' }, stored)).toMatchObject({
      time_limit_seconds: null,
      memory_limit_mb: 512,
    })
  })
})
