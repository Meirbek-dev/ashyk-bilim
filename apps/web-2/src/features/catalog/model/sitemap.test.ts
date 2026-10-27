import { expect, test } from 'vite-plus/test'

import { sitemapPages, sitemapXml } from './sitemap'

const course = (id: string, extra: Partial<{ public: boolean; archived_at_unix: number | null }> = {}) => ({
  id,
  public: true,
  archived_at_unix: null,
  updated_at_unix: 1_790_000_000,
  authors: [{ username: 'ann' }, { username: 'a&b' }],
  ...extra,
})

test('B-CAT-30 the sitemap lists public courses, collections and their authors, never private or archived ones', () => {
  const pages = sitemapPages(
    [course('c1'), course('private', { public: false }), course('old', { archived_at_unix: 1 })],
    [
      { id: 'k1', public: true, updated_at_unix: 1_790_000_000 },
      { id: 'mine', public: false },
    ],
  )
  expect(pages.map(page => page.path)).toEqual([
    '/',
    '/courses',
    '/collections',
    '/courses/c1',
    '/collections/k1',
    '/users/ann',
    '/users/a%26b',
  ])
})

test('B-CAT-30 the sitemap is a sitemaps.org document with absolute, escaped addresses', () => {
  const xml = sitemapXml('https://bilim.kz', [{ path: '/' }, { path: '/x?a=1&b=2', updatedAtUnix: 1_790_000_000 }])
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  expect(xml).toContain('<url><loc>https://bilim.kz/</loc></url>')
  expect(xml).toContain('<loc>https://bilim.kz/x?a=1&amp;b=2</loc><lastmod>2026-09-21T14:13:20.000Z</lastmod>')
})
