import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

/** An unknown or disabled user: the API answers 404 for both. */
export function UserNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.settings_user_not_found()}</h1>
      <Link to="/search">{m.platform_not_found_search()}</Link>
    </section>
  )
}
