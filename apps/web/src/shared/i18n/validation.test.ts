import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { validationMessage } from './validation'

const firstMessage = (schema: v.GenericSchema, value: unknown) => {
  const result = v.safeParse(schema, value)
  return result.success ? null : validationMessage(result.issues[0])
}

describe('validationMessage', () => {
  test('maps contract constraints to catalog texts with their limits', () => {
    expect(firstMessage(v.pipe(v.string(), v.minLength(1)), '')).toBe(m.validation_required())
    expect(firstMessage(v.pipe(v.string(), v.minLength(3)), 'ab')).toBe(m.validation_min_length({ min: '3' }))
    expect(firstMessage(v.pipe(v.string(), v.maxLength(5)), 'abcdef')).toBe(m.validation_max_length({ max: '5' }))
    expect(firstMessage(v.pipe(v.number(), v.maxValue(10)), 11)).toBe(m.validation_max_value({ max: '10' }))
    expect(firstMessage(v.pipe(v.string(), v.uuid()), 'x')).toBe(m.validation_format())
    expect(firstMessage(v.string(), 42)).toBe(m.validation_invalid())
  })
})
