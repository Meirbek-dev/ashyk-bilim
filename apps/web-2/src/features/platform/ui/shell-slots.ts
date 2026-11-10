import type { ComponentType } from 'react'

import { CommandPalette } from '#/features/catalog/route'
import { MessagesSlot } from '#/features/conversations/route'
import { NotificationsSlot } from '#/features/notifications/route'

/**
 * The right side of the top bar, filled by later slices: `search` (the command palette trigger, everyone) and
 * `notifications` (the bell, signed-in users), `messages` (the link to «Диалоги» with its badge, signed-in users). A slice sets its component here; an unset slot renders nothing.
 */
export const shellSlots: { search?: ComponentType; notifications?: ComponentType; messages?: ComponentType } = {
  search: CommandPalette,
  notifications: NotificationsSlot,
  messages: MessagesSlot,
}
