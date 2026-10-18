import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

export function NotFoundView() {
  return (
    <StatusScreen title={m.platform_not_found_title()} text={m.platform_not_found_text()}>
      <RouterLink to="/" className={buttonVariants()}>
        {m.platform_not_found_home()}
      </RouterLink>
      <RouterLink to="/search" className={buttonVariants({ variant: 'outline' })}>
        {m.platform_not_found_search()}
      </RouterLink>
    </StatusScreen>
  )
}
