import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, Outlet } from '@tanstack/react-router'

import { LogoutButton } from '#/features/auth'
import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'

/** Placeholder shell (phase 1.2 builds the real one): top bar with the current space links. */
export function AppLayout() {
  // An observer on the session keeps it fresh on window focus (spec 7.5).
  const { data: session } = useSuspenseQuery(sessionOptions())
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <Link to="/" className="font-semibold">
          {m.platform_brand()}
        </Link>
        <nav aria-label={m.platform_nav_label()} className="flex items-center gap-4 text-sm">
          {session ? <Link to="/home">{m.platform_nav_home()}</Link> : null}
          <Link to="/collections">{m.platform_nav_collections()}</Link>
          {session ? <LogoutButton /> : <Link to="/login">{m.platform_nav_login()}</Link>}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </>
  )
}
