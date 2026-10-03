import { useRef, useState, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
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
import { Button } from '#/shared/ui/button'

type SubmitDialogProps = {
  /** The attempt being handed in and the cap (null = no cap). */
  number: number
  max: number | null
  /** The page's "Submit" content (a spinner while the hand-in runs). */
  trigger: ReactNode
  disabled: boolean
  onConfirm: () => void
}

/**
 * "Submit the solution?" (B-COD-10): a hand-in spends the attempt and freezes the code, so it is asked every time.
 * Not the destructive ConfirmDialog: submitting is the page's primary step, not a loss.
 */
export function SubmitDialog({ number, max, trigger, disabled, onConfirm }: SubmitDialogProps) {
  const [open, setOpen] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open={open} onOpenChange={next => setOpen(next)}>
      <AlertDialogTrigger render={<Button disabled={disabled} />}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.code_submit_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {max === null ? m.code_submit_text_unlimited({ number }) : m.code_submit_text({ number, max })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">
            {m.ui_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            {m.code_submit()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
