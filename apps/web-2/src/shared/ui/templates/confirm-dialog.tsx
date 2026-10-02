import { useRef, type ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'

import { Alert } from '../alert'
import { Button } from '../button'
import { Dialog } from '../dialog'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that asks: a destructive Button with the verb. */
  trigger: ReactElement
  /** Names the object: «Удалить курс «X»?» */
  title: string
  /** The consequence, in one sentence. */
  consequence: string
  /** The destructive verb ("Delete"). */
  confirmLabel: string
  onConfirm: () => void
  pending: boolean
  error: unknown
}

/** Every destructive action goes through here (DESIGN 8). Focus starts on Cancel. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, trigger, title, consequence, confirmLabel, onConfirm, pending, error } = props
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={title}
      description={consequence}
      initialFocus={cancel}
      footer={
        <>
          <Button ref={cancel} variant="ghost" onClick={() => onOpenChange(false)}>
            {m.ui_cancel()}
          </Button>
          <Button variant="destructive" pending={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <Alert>{presentError(error)}</Alert> : null}
    </Dialog>
  )
}
