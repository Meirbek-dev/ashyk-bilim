import { createRouter, type AnyRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { ErrorView, NotFoundView, PendingView } from '#/features/platform'
import { createQueryClient } from '#/shared/api/query-client'
import type { AppPath } from '#/shared/auth/access'
import { requestNonce } from '#/shared/lib/csp'

import { routeTree } from './routeTree.gen'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The screen's name: the document title, a layout's heading. */
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
  guardViewTransitions(router)
  return router
}

/**
 * The router's own startViewTransition returns only `updateCallbackDone`, so a skipped transition (a resize or a
 * hidden tab mid-navigation) rejects `ready` and `finished` with nobody listening. Same logic, rejections handled:
 * a skipped transition only loses the animation, the update itself still ran.
 * ponytail: ignores `{ types }` view-transition options; the app only uses `true`.
 */
function guardViewTransitions(router: AnyRouter) {
  router.startViewTransition = update => {
    const wanted = router.shouldViewTransition ?? router.options.defaultViewTransition
    router.shouldViewTransition = undefined
    if (!wanted || typeof document === 'undefined' || typeof document.startViewTransition !== 'function')
      return update()
    const transition = document.startViewTransition(update)
    for (const settled of [transition.ready, transition.finished]) settled.catch(skippedTransition)
    return transition.updateCallbackDone
  }
}

function skippedTransition(): void {
  // Nothing to recover: the DOM update already happened (or failed, and updateCallbackDone carries that).
}
