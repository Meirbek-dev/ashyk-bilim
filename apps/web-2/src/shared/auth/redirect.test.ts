import { describe, expect, test } from 'vite-plus/test'

import { returnTo, safeRedirect } from './redirect'

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
    '/.//evil.example',
    '/a/..//evil.example',
    '/%2e//evil.example',
  ])('sends %j to /home', value => {
    expect(safeRedirect(value)).toBe('/home')
  })
})

test('B-AUTH-17 the header sign-in returns to the public page it was pressed on, not from the landing', () => {
  expect(returnTo('/courses/c1/about?tab=1')).toEqual({ redirect: '/courses/c1/about?tab=1' })
  expect(returnTo('/search?q=python')).toEqual({ redirect: '/search?q=python' })
  expect(returnTo('/')).toEqual({})
})
