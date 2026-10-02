import { Link } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

export function NotFoundView() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.platform_not_found_title()}</h1>
      <Link to="/" className="underline underline-offset-4">
        {m.platform_not_found_home()}
      </Link>
    </section>
  )
}
