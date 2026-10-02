import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet } from '@tanstack/react-router'

import { LogoutButton } from '#/features/auth'
import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { Link } from '#/shared/ui/link'
import { LocaleSwitch } from '#/shared/ui/locale-switch'
import { ModeSwitch } from '#/shared/ui/mode-switch'

/** Placeholder shell (phase 1.2 builds the real one): top bar with the current space links. */
export function AppLayout() {
  // An observer on the session keeps it fresh on window focus (spec 7.5).
  const { data: session } = useSuspenseQuery(sessionOptions())
  return (
    <>
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <Link to="/" variant="ghost">
          {m.platform_brand()}
        </Link>
        <nav aria-label={m.platform_nav_label()} className="flex flex-wrap items-center gap-1">
          {session ? (
            <Link to="/home" variant="ghost">
              {m.platform_nav_home()}
            </Link>
          ) : null}
          <Link to="/collections" variant="ghost">
            {m.platform_nav_collections()}
          </Link>
          <LocaleSwitch />
          <ModeSwitch />
          {session ? (
            <LogoutButton />
          ) : (
            <Link to="/login" variant="ghost">
              {m.platform_nav_login()}
            </Link>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </>
  )
}
