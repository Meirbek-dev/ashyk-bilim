import { createRootRouteWithContext } from '@tanstack/react-router'

import { AppLayout, ErrorView, NotFoundView, RootDocument } from '#/features/platform'
import { m } from '#/paraglide/messages'
import type { RouterContext } from '#/shared/api/query-client'
import { sessionOptions } from '#/shared/auth/session'
import appCss from '#/styles/globals.css?url'

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => ({ session: await context.queryClient.ensureQueryData(sessionOptions()) }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: m.platform_brand() },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: AppLayout,
  errorComponent: ErrorView,
  notFoundComponent: NotFoundView,
})
