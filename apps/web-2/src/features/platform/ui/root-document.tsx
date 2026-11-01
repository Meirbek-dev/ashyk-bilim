import { ClientOnly, HeadContent, rootRouteId, Scripts, useRouteContext } from '@tanstack/react-router'
import { lazy, Suspense, type ReactNode } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { useSessionExpired } from '#/shared/api/held-session'
import { LeaveConfirmHost } from '#/shared/components/leave-confirm'
import { RouteAnnouncer } from '#/shared/components/route-announcer'
import { fontAttribute, modeAttribute, readAppearance, themeHref } from '#/shared/lib/appearance'
import { Toaster } from '#/shared/ui/toast'

// Only while a held upload outlives the session (rare): not in the entry either.
const SessionExpiredNotice = lazy(() =>
  import('#/shared/components/session-expired-notice').then(module => ({ default: module.SessionExpiredNotice })),
)

/**
 * The HTML shell. Rendered even when the root route fails, so errors keep the document intact.
 * Theme, mode and font come from cookies during SSR: the first paint has the right colors, no script needed. A signed-in
 * user's theme is the account's (the session the root route read; absent when that read failed).
 * The Toaster mounts eagerly on the client so its provider subscribes before the first action emits a toast; the
 * leave-page question (`confirmLeave`) is drawn here too, and so is the region that says each new page's title.
 */
export function RootDocument({ children }: { children: ReactNode }) {
  const session = useRouteContext({ from: rootRouteId, select: context => context.session })
  const { theme, mode, font } = readAppearance(session ? session.user.theme : undefined)
  const expired = useSessionExpired()
  return (
    <html lang={getLocale()} data-theme={theme} data-mode={modeAttribute(mode)} data-font={fontAttribute(font)}>
      <head>
        <HeadContent />
        <link rel="stylesheet" href={themeHref(theme)} />
      </head>
      <body>
        {children}
        <ClientOnly>
          <Toaster />
          <LeaveConfirmHost />
          <RouteAnnouncer />
          <Suspense fallback={null}>{expired ? <SessionExpiredNotice /> : null}</Suspense>
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  )
}
