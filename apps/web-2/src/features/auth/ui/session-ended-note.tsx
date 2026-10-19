import { useHydrated } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionEnded } from '#/shared/auth/session'
import { Alert, AlertDescription } from '#/shared/ui/alert'

const ended = () => {
  try {
    return sessionEnded.get() === true
  } catch {
    return false
  }
}

/** Over the sign-in form when the session ended under the page (B-AUTH-16). Browser storage: after hydration only. */
export function SessionEndedNote() {
  const hydrated = useHydrated()
  if (!hydrated || !ended()) return null
  return (
    <Alert>
      <AlertDescription>{m.auth_session_ended()}</AlertDescription>
    </Alert>
  )
}
