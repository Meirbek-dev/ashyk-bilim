import { useBlocker } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { confirmLeave } from '#/shared/components/leave-confirm'

/**
 * The composer's text. A typed message (or picked files: `attached`) not sent yet asks before the page is left (a
 * link, a reload, a closed tab): it is not kept. The guard reads the draft at the moment of leaving: a send that just succeeded empties it before
 * its navigation runs, while the rendered state still holds the text.
 */
export function useDraft(pending: boolean) {
  const [text, setText] = useState('')
  const [attached, setAttachedState] = useState(false)
  const live = useRef('')
  const files = useRef(false)
  const edit = (value: string) => {
    live.current = value
    setText(value)
  }
  /** Whether files wait to be sent (read live by the guard, like the text). */
  const setAttached = (value: boolean) => {
    files.current = value
    setAttachedState(value)
  }
  const drafted = (text.trim() !== '' || attached) && !pending
  useBlocker({
    disabled: !drafted,
    enableBeforeUnload: drafted,
    shouldBlockFn: async () =>
      (live.current.trim() !== '' || files.current) &&
      !(await confirmLeave({ title: m.ui_unsaved_leave(), consequence: m.ui_unsaved_leave_consequence() })),
  })
  return { text, edit, setAttached }
}
