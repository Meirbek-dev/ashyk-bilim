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
} from '#/shared/ui/alert-dialog'
import { Spinner } from '#/shared/ui/spinner'

type ConflictDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Reload the current version of the object, then save the input of the user on top of it. */
  onRetry: () => void
  pending: boolean
}

/**
 * The one answer to a 412 (spec 7.6): someone saved the object since it was loaded. The form keeps the input;
 * "Reload and retry" saves it over the newer version, Cancel returns to the form.
 */
export function ConflictDialog({ open, onOpenChange, onRetry, pending }: ConflictDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={next => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.ui_conflict_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.ui_conflict_text()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">{m.ui_cancel()}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onRetry}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {m.ui_conflict_retry()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
