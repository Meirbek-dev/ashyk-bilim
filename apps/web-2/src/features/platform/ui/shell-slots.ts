import type { ComponentType } from 'react'

import { CommandPalette } from '#/features/catalog'

/**
 * The right side of the top bar, filled by later slices: `search` (the command palette trigger, everyone) and
 * `notifications` (the bell, signed-in users). A slice sets its component here; an unset slot renders nothing.
 */
export const shellSlots: { search?: ComponentType; notifications?: ComponentType } = { search: CommandPalette }
