import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { sessionEnded } from '#/shared/auth/session'

import { logoutOptions } from '../queries'

/**
 * Sign out, then the landing page. The mutation owns its callback: session invalidation can unmount the menu before
 * a per-call callback runs. A deliberate sign-out is not a «session ended» for the sign-in page (B-AUTH-16).
 */
export function useLogout(): () => void {
  const navigate = useNavigate()
  const logout = useMutation({
    ...logoutOptions(),
    onSuccess: async () => {
      sessionEnded.remove()
      await navigate({ to: '/' })
    },
  })
  return () => logout.mutate({})
}
