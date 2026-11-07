import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useMatches } from '@tanstack/react-router'

import { EmailBannerSlot } from '#/features/auth/route'
import { useLiveEvents } from '#/features/notifications/route'
import { useSessionExpired } from '#/shared/api/held-session'
import { shellWorkspace } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { SkipLink } from '#/shared/components/skip-link'

import { BottomBar } from './bottom-bar'
import { SidebarNav } from './sidebar-nav'
import { SiteFooter } from './site-footer'
import { TopBar } from './top-bar'

/**
 * The one app shell (spec 5.2, DESIGN 6): the navy rail of the current workspace (a bottom bar on phones), the
 * utility bar and the content. Guests get the bar with the brand and public links, and the colophon under the page. A route with `staticData.layout: 'focus'` draws FocusPage
 * itself, so the shell steps aside.
 */
export function AppShell() {
  // An observer on the session keeps it fresh on window focus (spec 7.5).
  const { data: session } = useSuspenseQuery(sessionOptions())
  const focus = useMatches({ select: matches => matches.some(match => match.staticData.layout === 'focus') })
  const workspace = shellWorkspace(session, useLocation({ select: location => location.pathname }))
  // The tab's event stream lives as long as the session, focus pages included (spec 7.7); one that ended while an
  // upload held the page opens again once the user has signed in in another tab.
  useLiveEvents(useSessionExpired() ? undefined : session?.user.id)
  if (focus) return <Outlet />
  return (
    <div className="flex min-h-dvh">
      {/* The first Tab stop: past the bars and the rail straight to the page (WCAG 2.4.1). */}
      <SkipLink />
      {session ? <SidebarNav session={session} workspace={workspace} /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar session={session} workspace={workspace.id} />
        <main
          id="main"
          tabIndex={-1}
          data-density={workspace.id === 'learn' ? undefined : 'compact'}
          className={`mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 pt-6 md:px-8 ${session ? 'pb-24 lg:pb-16' : 'pb-16'}`}
        >
          {session && !session.user.email_verified ? <EmailBannerSlot /> : null}
          <Outlet />
        </main>
        {session ? null : <SiteFooter />}
      </div>
      {session ? <BottomBar session={session} workspace={workspace} /> : null}
    </div>
  )
}
