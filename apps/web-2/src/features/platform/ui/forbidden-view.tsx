import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** A 403 shown in place: the URL stays, so a link shared with someone without access explains itself. */
export function ForbiddenView() {
  return (
    <StatusScreen title={m.platform_forbidden_title()} text={m.platform_forbidden_text()}>
      <RouterLink to="/" className={buttonVariants()}>
        {m.platform_not_found_home()}
      </RouterLink>
    </StatusScreen>
  )
}
