import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { sessionEnded } from '#/shared/auth/session'

import { logoutOptions } from '../queries'

/**
 * Sign out, then the landing page. The session query is invalidated by the mutation's meta; a deliberate sign-out is
 * not a «session ended» for the sign-in page (B-AUTH-16).
 */
export function useLogout(): () => void {
  const logout = useMutation(logoutOptions())
  const navigate = useNavigate()
  return () =>
    logout.mutate(
      {},
      {
        onSuccess: () => {
          sessionEnded.remove()
          void navigate({ to: '/' })
        },
      },
    )
}
