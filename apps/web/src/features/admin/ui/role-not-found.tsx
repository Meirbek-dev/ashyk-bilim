import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** An unknown role slug (the role list has no such role). */
export function RoleNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{m.admin_role_not_found()}</h1>
      <Link to="/admin/roles">{m.admin_roles_all()}</Link>
    </section>
  )
}
