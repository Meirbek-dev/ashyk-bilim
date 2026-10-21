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
import { TopBar } from './top-bar'

/**
 * The one app shell (spec 5.2, DESIGN 6): the top bar, the current workspace's sidebar (a bottom bar on phones)
 * and the content. Guests get it without navigation. A route with `staticData.layout: 'focus'` draws FocusPage
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
    <div className="flex min-h-dvh flex-col">
      {/* The first Tab stop: past the top bar and the sidebar straight to the page (WCAG 2.4.1). */}
      <SkipLink />
      <TopBar session={session} workspace={workspace.id} />
      <div className="flex flex-1">
        {session ? <SidebarNav session={session} workspace={workspace} /> : null}
        <main
          id="main"
          tabIndex={-1}
          data-density={workspace.id === 'learn' ? undefined : 'compact'}
          className={`mx-auto w-full max-w-6xl min-w-0 px-4 pt-gutter md:px-6 ${session ? 'pb-24 lg:pb-gutter' : 'pb-gutter'}`}
        >
          {session && !session.user.email_verified ? <EmailBannerSlot /> : null}
          <Outlet />
        </main>
      </div>
      {session ? <BottomBar session={session} workspace={workspace} /> : null}
    </div>
  )
}
