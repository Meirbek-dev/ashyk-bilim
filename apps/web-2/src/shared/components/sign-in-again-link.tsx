import { useLocation } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { Link } from './link'

/** /login in a new tab that comes back to this page: the cookie it sets is this tab's too. */
export function SignInAgainLink() {
  const here = useLocation({ select: location => location.href })
  return (
    <Link to="/login" search={{ redirect: here }} target="_blank" preload={false}>
      {m.ui_file_sign_in()}
    </Link>
  )
}
