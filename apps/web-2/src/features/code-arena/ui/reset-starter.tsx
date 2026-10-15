import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'

/** "Back to the starter code": the learner's text goes, so it asks first (B-COD-24). */
export function ResetStarter({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">{m.code_reset_starter()}</Button>}
      title={m.code_reset_starter_title()}
      consequence={m.code_reset_starter_text()}
      confirmLabel={m.code_reset_starter()}
      pending={false}
      error={null}
      onConfirm={() => {
        onReset()
        setOpen(false)
      }}
    />
  )
}
