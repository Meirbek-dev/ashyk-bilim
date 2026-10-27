import { expect, test } from 'vite-plus/test'

import { robotsTxt } from './robots'

const robots = robotsTxt('https://bilim.kz')
const rules = robots
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

test('B-CAT-30 robots.txt names the sitemap on the site address', () => {
  expect(robots).toContain('\nSitemap: https://bilim.kz/sitemap.xml\n')
})
