import { useId, type FormEvent, type ReactElement, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/shared/ui/dialog'
import { Spinner } from '#/shared/ui/spinner'

import { ErrorAlert } from '../error-alert'

type FormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The stock Button that opens the dialog ("New collection"). */
  trigger: ReactElement
  title: string
  /** The verb of the create action ("Create"). */
  submitLabel: string
  /** `() => form.handleSubmit()` of a useAppForm whose onSubmit is the mutation; on success navigate to the entity. */
  onSubmit: () => Promise<void>
  pending: boolean
  /** The error of the mutation: field errors show under their fields, this is the message for the whole form. */
  error: unknown
  /** The minimum fields: `form.AppField` items. */
  children: ReactNode
}

/** Create = this dialog, then the own page of the entity (DESIGN 8). Cancel is ghost, the verb is primary. */
export function FormDialog(props: FormDialogProps) {
  const { open, onOpenChange, trigger, title, submitLabel, onSubmit, pending, error, children } = props
  const formId = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit()
  }
  return (
    <Dialog open={open} onOpenChange={next => onOpenChange(next)}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
          {children}
          {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>{m.ui_cancel()}</DialogClose>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
