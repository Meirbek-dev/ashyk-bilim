import { useState } from 'react'

import { RotateCcw } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'

/** "Back to the starter code", in the workspace toolbar: the learner's text goes, so it asks first (B-COD-24). */
export function ResetStarter({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<IconButton label={m.code_reset_starter()} icon={<RotateCcw aria-hidden />} />}
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
