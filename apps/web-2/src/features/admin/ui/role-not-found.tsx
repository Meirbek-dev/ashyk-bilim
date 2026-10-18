import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown role slug (the role list has no such role). */
export function RoleNotFound() {
  return (
    <StatusScreen title={m.admin_role_not_found()} text={m.ui_not_found_text()}>
      <RouterLink to="/admin/roles" className={buttonVariants()}>
        {m.admin_roles_all()}
      </RouterLink>
    </StatusScreen>
  )
}
