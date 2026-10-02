import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { ErrorView, NotFoundView, PendingView } from '#/features/platform'
import { createQueryClient } from '#/shared/api/query-client'
import { requestNonce } from '#/shared/lib/csp'

import { routeTree } from './routeTree.gen'

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
