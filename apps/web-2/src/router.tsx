import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { ErrorView, NotFoundView, PendingView } from '#/features/platform'
import { createQueryClient } from '#/shared/api/query-client'
import type { AppPath } from '#/shared/auth/access'
import { requestNonce } from '#/shared/lib/csp'

import { routeTree } from './routeTree.gen'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The screen's name: the document title, a layout's heading, an UnderConstruction stub's heading. */
    title?: () => string
    /** 'focus': the route draws the focus layout (FocusPage) itself and the app shell steps aside (spec 5.2). */
    layout?: 'focus'
    /** A layout's tabs, one child route each; the English label is the URL segment (spec 5.2). */
    tabs?: readonly { to: AppPath; label: () => string }[]
  }
}

export function getRouter() {
  const queryClient = createQueryClient(() => router.invalidate())
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Freshness is owned by Query alone (spec 7.6).
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorView,
    defaultNotFoundComponent: NotFoundView,
    defaultPendingComponent: PendingView,
    defaultViewTransition: true,
    scrollRestoration: true,
    ssr: { nonce: requestNonce() },
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}
