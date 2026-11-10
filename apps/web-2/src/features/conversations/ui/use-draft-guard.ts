import { useBlocker } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { confirmLeave } from '#/shared/components/leave-confirm'

/** A typed message not sent yet asks before the page is left (a link, a reload, a closed tab): it is not kept. */
export function useDraftGuard(drafted: boolean) {
  useBlocker({
    disabled: !drafted,
    enableBeforeUnload: drafted,
    shouldBlockFn: async () =>
      !(await confirmLeave({ title: m.ui_unsaved_leave(), consequence: m.ui_unsaved_leave_consequence() })),
  })
}
