import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

/** Placeholder landing (slice 3.2 designs the real one). */
export function LandingPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{m.platform_landing_title()}</h1>
      <Link to="/collections">{m.platform_landing_browse()}</Link>
    </section>
  )
}
