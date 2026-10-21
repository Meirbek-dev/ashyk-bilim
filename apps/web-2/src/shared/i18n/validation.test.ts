import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { serverFieldMessage, validationMessage } from './validation'

const firstMessage = (schema: v.GenericSchema, value: unknown) => {
  const result = v.safeParse(schema, value)
  return result.success ? null : validationMessage(result.issues[0])
}

describe('validationMessage', () => {
  test('maps contract constraints to catalog texts with their limits', () => {
    expect(firstMessage(v.pipe(v.string(), v.minLength(1)), '')).toBe(m.validation_required())
    expect(firstMessage(v.pipe(v.string(), v.minLength(3)), 'ab')).toBe(m.validation_min_length({ min: '3' }))
    // Blank is "required", not "at least 3".
    expect(firstMessage(v.pipe(v.string(), v.minLength(3)), '')).toBe(m.validation_required())
    expect(firstMessage(v.pipe(v.string(), v.maxLength(5)), 'abcdef')).toBe(m.validation_max_length({ max: '5' }))
    expect(firstMessage(v.pipe(v.number(), v.maxValue(10)), 11)).toBe(m.validation_max_value({ max: '10' }))
    expect(firstMessage(v.pipe(v.string(), v.uuid()), 'x')).toBe(m.validation_format())
    expect(firstMessage(v.string(), 42)).toBe(m.validation_invalid())
    expect(firstMessage(v.pipe(v.string(), v.email()), 'x')).toBe(m.validation_email())
  })

  test('a blank field reads "fill it in" whatever rule it breaks (a pattern, a custom check)', () => {
    expect(firstMessage(v.pipe(v.string(), v.regex(/^[a-z-]+$/)), '')).toBe(m.validation_required())
    expect(
      firstMessage(
        v.pipe(
          v.string(),
          v.check(text => text.length > 0),
        ),
        '',
      ),
    ).toBe(m.validation_required())
    expect(firstMessage(v.pipe(v.string(), v.regex(/^[a-z-]+$/)), 'A B')).toBe(m.validation_format())
    // A check on the whole form, forwarded to one of its fields: that field's value decides.
    const cutoff = v.pipe(
      v.object({ kind: v.string(), at: v.string() }),
      v.forward(
        v.check(form => form.kind !== 'cutoff' || /\d{4}-\d{2}/.test(form.at)),
        ['at'],
      ),
    )
    expect(firstMessage(cutoff, { kind: 'cutoff', at: '' })).toBe(m.validation_required())
    expect(firstMessage(cutoff, { kind: 'cutoff', at: 'x' })).toBe(m.validation_invalid())
  })

  test('a server "invalid" on an email field says what an address looks like; elsewhere it stays generic', () => {
    expect(serverFieldMessage('invalid', 'email')).toBe(m.validation_email())
    expect(serverFieldMessage('invalid', 'contact_email')).toBe(m.validation_email())
    expect(serverFieldMessage('invalid', 'username')).toBe(m.validation_invalid())
    expect(serverFieldMessage('required', 'email')).toBe(m.validation_required())
  })
})
