import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { languageName } from './labels'

describe('languageName', () => {
  const python = { id: 'python', name: 'Python (3.13)' }

  test('B-COD-05 the platform names the language; one it no longer offers is unavailable', () => {
    expect(languageName([python], 'python')).toBe('Python (3.13)')
    expect(languageName([python], 'java')).toBe(m.code_language_unknown({ id: 'java' }))
  })

  test('B-COD-23 with the runner down the name is unknown, not the language unavailable', () => {
    expect(languageName(null, 'python')).toBe(m.code_language_slug({ id: 'python' }))
  })
})
