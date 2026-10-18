import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown id, a malformed one, or someone else's hidden collection: the API does not tell them apart (UX-078). */
export function CollectionNotFound() {
  return (
    <StatusScreen title={m.collections_not_found()} text={m.ui_not_found_text()}>
      <RouterLink to="/collections" className={buttonVariants()}>
        {m.collections_all()}
      </RouterLink>
    </StatusScreen>
  )
}
