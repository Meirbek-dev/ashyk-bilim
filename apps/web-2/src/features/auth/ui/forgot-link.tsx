import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** The way out of a forgotten password: the interface's blue, as the other short "way on" links. */
export function ForgotLink() {
  return (
    <Link to="/reset-password" variant="accent">
      {m.auth_login_forgot()}
    </Link>
  )
}
