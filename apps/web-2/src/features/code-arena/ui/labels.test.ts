import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { languageName } from './labels'

describe('languageName', () => {
  const python = { id: 71, name: 'Python (3.8.1)', monaco_language: 'python' }

  test('B-COD-05 the platform names the language; one it no longer offers is unavailable', () => {
    expect(languageName([python], 71)).toBe('Python (3.8.1)')
    expect(languageName([python], 62)).toBe(m.code_language_unknown({ id: 62 }))
  })

  test('B-COD-23 with the runner down the name is unknown, not the language unavailable', () => {
    expect(languageName(null, 71)).toBe(m.code_language_number({ id: 71 }))
  })
})
