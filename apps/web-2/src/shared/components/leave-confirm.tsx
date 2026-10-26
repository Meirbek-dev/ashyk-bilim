import { useSyncExternalStore } from 'react'

import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'

// "Leave this page?" as the app's own dialog, not the browser's window.confirm (unstyled, "localhost says", English
// buttons in some browsers). A route blocker awaits `confirmLeave`; LeaveConfirmHost (mounted once in the document)
// shows the question. A reload or a closed tab still gets the browser's own beforeunload prompt: no page can draw there.

type Question = { title: string; consequence: string }
type Asked = Question & { answer: (leave: boolean) => void }

let asked: Asked | null = null
// What the dialog says while it closes (its exit animation), after the question is answered.
let shown: Question = { title: '', consequence: '' }
const listeners = new Set<() => void>()

function setAsked(next: Asked | null): void {
  asked = next
  if (next) shown = { title: next.title, consequence: next.consequence }
  for (const listener of listeners) listener()
}

/** Asks whether to leave the page; true to leave. A second question answers the first one "stay". */
export function confirmLeave(question: Question): Promise<boolean> {
  asked?.answer(false)
  return new Promise(resolve => {
    setAsked({
      ...question,
      answer: leave => {
        setAsked(null)
        resolve(leave)
      },
    })
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** The dialog of `confirmLeave`; focus starts on «Отмена», so Enter or Escape keeps the page. */
export function LeaveConfirmHost() {
  const open = useSyncExternalStore(
    subscribe,
    () => asked !== null,
    () => false,
  )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        if (!next) asked?.answer(false)
      }}
      title={shown.title}
      consequence={shown.consequence}
      confirmLabel={m.ui_leave_confirm()}
      onConfirm={() => asked?.answer(true)}
      pending={false}
      error={null}
    />
  )
}
