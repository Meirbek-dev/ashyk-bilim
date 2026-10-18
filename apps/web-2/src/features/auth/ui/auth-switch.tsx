import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

/** The line under a sign-in or sign-up form that leads to the other one; the place the guest was headed goes along. */
export function AuthSwitch({ to, redirect }: { to: '/login' | '/signup'; redirect: string | undefined }) {
  return (
    <p className="text-sm text-muted-foreground">
      {to === '/signup' ? m.auth_login_no_account() : m.auth_signup_have_account()}{' '}
      <Link to={to} search={{ redirect }}>
        {to === '/signup' ? m.platform_nav_signup() : m.auth_login_submit()}
      </Link>
    </p>
  )
}
