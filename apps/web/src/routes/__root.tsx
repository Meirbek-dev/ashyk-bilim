import { createRootRouteWithContext } from '@tanstack/react-router'

import { AppShell, ErrorView, NotFoundView, RootDocument } from '#/features/platform'
import { m } from '#/paraglide/messages'
import type { RouterContext } from '#/shared/api/query-client'
import { sessionOptions } from '#/shared/auth/session'
import { ssrStatusHeaders } from '#/shared/lib/ssr-status'
import appCss from '#/styles/globals.css?url'

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => ({ session: await context.queryClient.ensureQueryData(sessionOptions()) }),
  head: ({ matches }) => {
    // The deepest route with a title names the document; a route's own head may still override it.
    const title = matches.findLast(match => match.staticData.title)?.staticData.title?.()
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: title ? `${title} · ${m.platform_brand()}` : m.platform_brand() },
      ],
      links: [{ rel: 'stylesheet', href: appCss }],
    }
  },
  headers: ssrStatusHeaders,
  shellComponent: RootDocument,
  component: AppShell,
  errorComponent: ErrorView,
  notFoundComponent: NotFoundView,
})
