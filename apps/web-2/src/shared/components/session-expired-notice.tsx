import { m } from '#/paraglide/messages'
import { Alert } from '#/shared/ui/alert'

import { SignInAgainLink } from './sign-in-again-link'

/**
 * The session ended while an upload is held (`shared/api/held-session.ts`): the page stays, this says so and offers to
 * sign in in a new tab; the upload's «Повторить» then finishes it. Not a dialog: the page keeps working meanwhile.
 */
export function SessionExpiredNotice() {
  return (
    <Alert className="fixed inset-x-4 top-4 z-50 mx-auto flex w-auto max-w-md flex-wrap items-center gap-x-3 gap-y-1 shadow-lg">
      <p>{m.ui_session_expired()}</p>
      <SignInAgainLink />
    </Alert>
  )
}
