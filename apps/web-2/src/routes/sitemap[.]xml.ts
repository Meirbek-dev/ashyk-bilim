import { createFileRoute } from '@tanstack/react-router'

import { siteOrigin } from '#/shared/lib/document-title'

// B-CAT-30: the public pages for search engines (robots.txt names this address). A document like any page: read
// from the API on request, an hour in caches. The catalog loads on request, never in the entry chunk.
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { publicPages, sitemapXml } = await import('#/features/catalog')
        return new Response(sitemapXml(siteOrigin(), await publicPages()), {
          headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
        })
      },
    },
  },
})
