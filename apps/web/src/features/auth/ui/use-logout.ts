import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { logoutOptions } from '../queries'

/** Sign out, then the landing page. The session query is invalidated by the mutation's meta. */
export function useLogout(): () => void {
  const logout = useMutation(logoutOptions())
  const navigate = useNavigate()
  return () => logout.mutate({}, { onSuccess: () => void navigate({ to: '/' }) })
}
