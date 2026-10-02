import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

/** A 403 shown in place: the URL stays, so a link shared with someone without access explains itself. */
export function ForbiddenView() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.platform_forbidden_title()}</h1>
      <p className="text-muted-foreground">{m.ui_forbidden()}</p>
      <Link to="/">{m.platform_not_found_home()}</Link>
    </section>
  )
}
