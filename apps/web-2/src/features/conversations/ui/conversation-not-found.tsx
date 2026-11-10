import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown id or someone else's conversation: the API answers 404 for both, so no one learns it exists. */
export function ConversationNotFound() {
  return (
    <StatusScreen title={m.conversations_not_found()} text={m.ui_not_found_text()}>
      <RouterLink to="/conversations" className={buttonVariants()}>
        {m.conversations_back()}
      </RouterLink>
    </StatusScreen>
  )
}
