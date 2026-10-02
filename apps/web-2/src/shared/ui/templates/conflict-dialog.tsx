import { m } from '#/paraglide/messages'

import { Button } from '../button'
import { Dialog } from '../dialog'

type ConflictDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Reload the object's current version, then save the user's input on top of it. */
  onRetry: () => void
  pending: boolean
}

/**
 * The one answer to a 412 (spec 7.6): someone saved the object since it was loaded. The form keeps the user's input;
 * "Reload and retry" saves it over the newer version, Cancel returns to the form.
 */
export function ConflictDialog({ open, onOpenChange, onRetry, pending }: ConflictDialogProps) {
  return (
    <Dialog
      alert
      open={open}
      onOpenChange={onOpenChange}
      title={m.ui_conflict_title()}
      description={m.ui_conflict_text()}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.ui_cancel()}
          </Button>
          <Button pending={pending} onClick={onRetry}>
            {m.ui_conflict_retry()}
          </Button>
        </>
      }
    />
  )
}
