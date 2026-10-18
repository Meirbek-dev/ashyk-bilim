import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown or disabled user: the API answers 404 for both. */
export function UserNotFound() {
  return (
    <StatusScreen title={m.settings_user_not_found()} text={m.ui_not_found_text()}>
      <RouterLink to="/search" className={buttonVariants()}>
        {m.platform_not_found_search()}
      </RouterLink>
    </StatusScreen>
  )
}
