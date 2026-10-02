import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { logoutOptions } from '../queries'

export function LogoutButton() {
  const logout = useMutation(logoutOptions())
  const navigate = useNavigate()
  return (
    <Button
      variant="quiet"
      disabled={logout.isPending}
      onClick={() => logout.mutate({}, { onSuccess: () => navigate({ to: '/' }) })}
    >
      {m.auth_logout()}
    </Button>
  )
}
