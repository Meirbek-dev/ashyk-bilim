import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/**
 * The way out of a forgotten password: the interface's blue, as the other short "way on" links, at the size of the
 * field labels and hints it stands among.
 */
export function ForgotLink() {
  return (
    <p className="text-sm">
      <Link to="/reset-password" variant="accent">
        {m.auth_login_forgot()}
      </Link>
    </p>
  )
}
