import { expect, test } from 'vite-plus/test'

import { linkHref } from './link'

test('B-EDT-23 a link is stored absolute: bare hosts get https, relative paths and scripts are refused', () => {
  expect(linkHref(' example.com ')).toBe('https://example.com')
  expect(linkHref('www.site.kz/path?q=1#x')).toBe('https://www.site.kz/path?q=1#x')
  expect(linkHref('https://example.com/a')).toBe('https://example.com/a')
  expect(linkHref('http://old.example.com')).toBe('http://old.example.com')
  expect(linkHref('mailto:teacher@school.kz')).toBe('mailto:teacher@school.kz')
  expect(linkHref('#section-2')).toBe('#section-2')
  const refused = ['', '#', '/course/1', './x', '../x', '//evil.com', 'javascript:alert(1)', 'word', 'a b.com']
  expect(refused.filter(value => linkHref(value) !== undefined)).toEqual([])
})
