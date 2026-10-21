import { createRouter, type AnyRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { ErrorView, NotFoundView, PendingView } from '#/features/platform'
import { createQueryClient } from '#/shared/api/query-client'
import type { AppPath } from '#/shared/auth/access'
import { reloadOnLanguageChange } from '#/shared/i18n/printed-locale'
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
    /** The shape of the route's loading skeleton (PendingView) when it is not a list: card grid, object page, tiles. */
    skeleton?: 'grid' | 'detail' | 'tiles'
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
  reloadOnLanguageChange(router)
  if (typeof document !== 'undefined')
    // A search change swaps screens too (a test's entry -> its running attempt, `?attempt=`); a hash alone does not.
    router.subscribe('onRendered', ({ fromLocation, toLocation, pathChanged }) => {
      if (fromLocation && (pathChanged || fromLocation.searchStr !== toLocation.searchStr)) focusNewPage()
    })
  return router
}

/**
 * The router's own startViewTransition returns only `updateCallbackDone`, so a skipped transition (a resize or a
 * hidden tab mid-navigation) rejects `ready` and `finished` with nobody listening. Same logic, rejections handled:
 * a skipped transition only loses the animation, the update itself still ran.
 * Off on WebKit (Safari, and every iOS browser): Playwright's WebKit crashed the page on every client navigation
 * with view transitions on (OPEN-E-5); an animation is not worth that risk.
 * ponytail: ignores `{ types }` view-transition options; the app only uses `true`.
 */
function guardViewTransitions(router: AnyRouter) {
  router.startViewTransition = update => {
    const wanted = router.shouldViewTransition ?? router.options.defaultViewTransition
    router.shouldViewTransition = undefined
    if (
      !wanted ||
      typeof document === 'undefined' ||
      typeof document.startViewTransition !== 'function' ||
      isWebKit(navigator.userAgent)
    )
      return update()
    const transition = document.startViewTransition(update)
    for (const settled of [transition.ready, transition.finished]) settled.catch(skippedTransition)
    return transition.updateCallbackDone
  }
}

/** WebKit underneath: Safari, and Chrome/Firefox/Edge on iOS (CriOS, FxiOS, EdgiOS); Blink browsers say Chrome/. */
export const isWebKit = (userAgent: string) => /AppleWebKit/.test(userAgent) && !/Chrome\/|Chromium\//.test(userAgent)

/**
 * After a client navigation that dropped the focus (the clicked link or button left with the old page, so it sits on
 * <body>), it goes to the new page's heading: a keyboard or screen-reader user goes on from the page they are on,
 * not from the top of the document. Focus that survived (a sidebar link, a tab) stays.
 */
export function focusNewPage(): void {
  const active = document.activeElement
  if (active && active !== document.body && active.isConnected) return
  const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

function skippedTransition(): void {
  // Nothing to recover: the DOM update already happened (or failed, and updateCallbackDone carries that).
}
