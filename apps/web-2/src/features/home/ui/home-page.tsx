import { useRouteContext } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

/** Placeholder "Today" (slice 3.1): proves the authed, data-only SSR path with the session. */
export function HomePage() {
  const { session } = useRouteContext({ from: '/_authed' })
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{m.home_title()}</h1>
      <p>{m.home_signed_in_as({ name: session.user.display_name })}</p>
      <p className="text-muted-foreground">{m.home_roles({ roles: session.roles.join(', ') })}</p>
    </section>
  )
}
