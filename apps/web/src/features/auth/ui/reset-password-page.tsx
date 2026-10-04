import { useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

import { AuthPage } from './auth-page'
import { ResetConfirmForm } from './reset-confirm-form'
import { ResetRequestForm } from './reset-request-form'

/**
 * Password reset in two steps: ask for a code, then set a new password with it. The login stays in memory, not in
 * the URL; the email's link (`?email=&code=`) opens the code step filled.
 */
export function ResetPasswordPage() {
  const search = useSearch({ from: '/_guest/reset-password' })
  const [login, setLogin] = useState(search.email)
  return (
    <AuthPage title={m.platform_page_reset_password()}>
      {login === undefined ? (
        <ResetRequestForm onSent={setLogin} />
      ) : (
        <ResetConfirmForm login={login} code={search.code} onRestart={() => setLogin(undefined)} />
      )}
      <Link to="/login">{m.auth_verify_to_login()}</Link>
    </AuthPage>
  )
}
