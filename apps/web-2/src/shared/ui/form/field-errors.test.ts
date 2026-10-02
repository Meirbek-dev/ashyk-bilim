import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { errorText, splitFieldErrors } from './field-errors'

const ru = { locale: 'ru' } as const

describe('errorText', () => {
  test('takes the first message from Valibot issues or server strings', () => {
    expect(errorText([{ message: 'issue', path: [] }, 'later'])).toBe('issue')
    expect(errorText([undefined, 'server'])).toBe('server')
    expect(errorText([])).toBeUndefined()
  })
})

describe('splitFieldErrors', () => {
  test('puts each known field error under its field and keeps the rest for the form', () => {
    const { byField, rest } = splitFieldErrors(
      [
        { field: 'name', code: 'required', message: 'name must not be blank' },
        { field: 'name', code: 'too-long', message: 'second error on the same field' },
        { field: 'items[0].title', code: 'mystery', message: 'no text for this code' },
        { field: 'body', code: 'invalid', message: 'not a field of this form' },
      ],
      ['name', 'items[0].title'],
    )
    expect(byField.get('name')).toBe(m.validation_required({}, ru))
    expect(byField.get('items[0].title')).toBe(m.validation_invalid({}, ru))
    expect(rest.map(error => error.field)).toEqual(['body'])
  })
})
