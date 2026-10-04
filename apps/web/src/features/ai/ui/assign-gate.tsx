import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'

type AssignGateProps = { disabled: boolean; onConfirm: () => void }

/** "Assign remediation" asks first (UX-139): the learner is blocked until they pass it (B-AI-17). */
export function AssignGate({ disabled, onConfirm }: AssignGateProps) {
  const [open, setOpen] = useState(false)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" disabled={disabled}>
          {m.ai_gate_assign()}
        </Button>
      }
      title={m.ai_gate_title()}
      consequence={m.ai_gate_consequence()}
      confirmLabel={m.ai_gate_assign()}
      onConfirm={() => {
        setOpen(false)
        onConfirm()
      }}
      pending={false}
      error={null}
    />
  )
}
