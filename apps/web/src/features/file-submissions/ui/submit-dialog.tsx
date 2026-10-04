import { useRef, type ReactNode } from 'react'

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
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The attempt being handed in and the cap (null = no cap). */
  number: number
  max: number | null
  /** The page's "Submit work" button content (a spinner while the hand-in runs). */
  trigger: ReactNode
  disabled: boolean
  onConfirm: () => void
}

/**
 * "Submit work?" (B-FSB-05): a hand-in spends an attempt and freezes the files until the review, so it is asked
 * every time. Not the destructive ConfirmDialog: submitting is the page's primary step, not a loss. It closes on
 * confirm; the page's button shows the request.
 */
export function SubmitDialog(props: SubmitDialogProps) {
  const { open, onOpenChange, number, max, trigger, disabled, onConfirm } = props
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open={open} onOpenChange={next => onOpenChange(next)}>
      <AlertDialogTrigger render={<Button disabled={disabled} />}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.submission_submit_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {max === null ? m.submission_submit_text_unlimited({ number }) : m.submission_submit_text({ number, max })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">
            {m.ui_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{m.submission_submit()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
