import { createFileRoute } from '@tanstack/react-router'

import { siteOrigin } from '#/shared/lib/document-title'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { robotsTxt } = await import('#/features/platform')
        return new Response(robotsTxt(siteOrigin()), {
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
        })
      },
    },
  },
})
