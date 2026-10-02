import { describe, expect, test } from 'vite-plus/test'

import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  test.each(['/home', '/collections?cursor=abc', '/learn/1/2#top'])('keeps the internal path %s', path => {
    expect(safeRedirect(path)).toBe(path)
  })

  test.each([
    undefined,
    '',
    'home',
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
  ])('sends %j to /home', value => {
    expect(safeRedirect(value)).toBe('/home')
  })
})
