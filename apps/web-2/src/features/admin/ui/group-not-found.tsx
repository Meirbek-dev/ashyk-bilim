import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

/** An unknown or malformed group id. */
export function GroupNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.admin_group_not_found()}</h1>
      <Link to="/teach/groups">{m.admin_groups_all()}</Link>
    </section>
  )
}
