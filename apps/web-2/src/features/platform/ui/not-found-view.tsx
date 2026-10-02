import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

export function NotFoundView() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.platform_not_found_title()}</h1>
      <div className="flex flex-wrap gap-4">
        <Link to="/search">{m.platform_not_found_search()}</Link>
        <Link to="/">{m.platform_not_found_home()}</Link>
      </div>
    </section>
  )
}
