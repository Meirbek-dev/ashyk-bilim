import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown or malformed group id. */
export function GroupNotFound() {
  return (
    <StatusScreen title={m.admin_group_not_found()} text={m.ui_not_found_text()}>
      <RouterLink to="/teach/groups" className={buttonVariants()}>
        {m.admin_groups_all()}
      </RouterLink>
    </StatusScreen>
  )
}
