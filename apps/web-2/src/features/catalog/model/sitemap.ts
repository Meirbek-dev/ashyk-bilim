/** One public page in `/sitemap.xml`: its path and, when known, when it last changed. */
export interface SitemapPage {
  path: string
  updatedAtUnix?: number | null
}

interface Listed {
  id: string
  public: boolean
  archived_at_unix?: number | null
  updated_at_unix?: number | null
}

interface ListedCourse extends Listed {
  authors: readonly { username: string }[]
}

const escapeXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const open = <T extends Listed>(items: readonly T[]) => items.filter(item => item.public && !item.archived_at_unix)

/**
 * The pages a search engine may index: the landing, the catalog, every public course and collection, and the
 * profiles of the people who teach those courses. A course or collection the reader sees only because of their
 * session (their own private one) or one in the archive is left out.
 */
export function sitemapPages(courses: readonly ListedCourse[], collections: readonly Listed[]): SitemapPage[] {
  const publicCourses = open(courses)
  const authors = [...new Set(publicCourses.flatMap(course => course.authors.map(author => author.username)))]
  return [
    { path: '/' },
    { path: '/courses' },
    { path: '/collections' },
    ...publicCourses.map(course => ({ path: `/courses/${course.id}`, updatedAtUnix: course.updated_at_unix })),
    ...open(collections).map(item => ({ path: `/collections/${item.id}`, updatedAtUnix: item.updated_at_unix })),
    ...authors.map(username => ({ path: `/users/${encodeURIComponent(username)}` })),
  ]
}

/** The sitemaps.org document for `pages` on `origin`. */
export function sitemapXml(origin: string, pages: readonly SitemapPage[]): string {
  const urls = pages.map(page => {
    const lastmod = page.updatedAtUnix ? `<lastmod>${new Date(page.updatedAtUnix * 1000).toISOString()}</lastmod>` : ''
    return `  <url><loc>${escapeXml(`${origin}${page.path}`)}</loc>${lastmod}</url>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
