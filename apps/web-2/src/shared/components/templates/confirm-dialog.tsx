import { useRef, type ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/shared/ui/alert-dialog'
import { Spinner } from '#/shared/ui/spinner'

import { ErrorAlert } from '../error-alert'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that asks: a destructive Button with the verb; none when the app opens it (a switch turned off). */
  trigger?: ReactElement | undefined
  /** Names the object: «Удалить курс «X»?» */
  title: string
  /** The consequence, in one sentence. */
  consequence: string
  /** The destructive verb ("Delete"). */
  confirmLabel: string
  /** None: the dialog only explains (nothing to do), its one button closes it. */
  onConfirm?: (() => void) | undefined
  pending: boolean
  error: unknown
}

/** Every destructive action goes through here (DESIGN 8), on the stock AlertDialog. Focus starts on Cancel. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, trigger, title, consequence, confirmLabel, onConfirm, pending, error } = props
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open={open} onOpenChange={next => onOpenChange(next)}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">
            {onConfirm ? m.ui_cancel() : m.ui_close()}
          </AlertDialogCancel>
          {onConfirm ? (
            <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {confirmLabel}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
