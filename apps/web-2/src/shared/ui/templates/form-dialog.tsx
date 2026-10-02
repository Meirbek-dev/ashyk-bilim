import { useId, type FormEvent, type ReactElement, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'

import { Alert } from '../alert'
import { Button } from '../button'
import { Dialog } from '../dialog'

type FormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The kit Button that opens the dialog ("New collection"). */
  trigger: ReactElement
  title: string
  /** The verb of the create action ("Create"). */
  submitLabel: string
  /** `() => form.handleSubmit()` of a useAppForm whose onSubmit is the mutation; on success navigate to the new entity. */
  onSubmit: () => Promise<void>
  pending: boolean
  /** The mutation's error: field errors show under their fields, this is the message for the whole form. */
  error: unknown
  /** The minimum fields: `form.AppField` items. */
  children: ReactNode
}

/** Create = this dialog, then the entity's own page (DESIGN 8). Cancel is ghost, the verb is primary. */
export function FormDialog(props: FormDialogProps) {
  const { open, onOpenChange, trigger, title, submitLabel, onSubmit, pending, error, children } = props
  const formId = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.ui_cancel()}
          </Button>
          <Button type="submit" form={formId} pending={pending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {children}
        {error ? <Alert>{presentError(error)}</Alert> : null}
      </form>
    </Dialog>
  )
}
