import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useMatches } from '@tanstack/react-router'

import { shellWorkspace } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'

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
  if (focus) return <Outlet />
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar session={session} workspace={workspace.id} />
      <div className="flex flex-1">
        {session ? <SidebarNav session={session} workspace={workspace} /> : null}
        <main
          data-density={workspace.id === 'learn' ? undefined : 'compact'}
          className={`mx-auto w-full max-w-6xl min-w-0 px-4 pt-gutter md:px-6 ${session ? 'pb-24 lg:pb-gutter' : 'pb-gutter'}`}
        >
          <Outlet />
        </main>
      </div>
      {session ? <BottomBar session={session} workspace={workspace} /> : null}
    </div>
  )
}
