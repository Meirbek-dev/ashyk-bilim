import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'

const rules = readFileSync(resolve(import.meta.dirname, '../../../public/robots.txt'), 'utf8')
  .split('\n')
  .flatMap(line => /^Disallow: (.+)$/.exec(line)?.[1] ?? [])
  .map(rule => new RegExp(`^${rule.replaceAll('*', '[^/]+')}`))

const blocked = (path: string) => rules.some(rule => rule.test(path))

test('crawlers index the public pages and skip signed-in areas, search results and code links', () => {
  const open = ['/', '/courses', '/courses/x/about', '/collections', '/collections/x', '/users/ann', '/login']
  const closed = ['/home', '/learning', '/learn/x', '/teach/courses', '/admin/users', '/settings/profile']
  const detours = ['/collections/x/edit', '/search?q=python', '/verify-email?code=1', '/reset-password']
  expect(open.filter(blocked)).toEqual([])
  expect([...closed, ...detours].filter(path => !blocked(path))).toEqual([])
})
