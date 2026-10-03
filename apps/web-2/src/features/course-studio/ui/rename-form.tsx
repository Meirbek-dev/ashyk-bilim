import { useHotkey } from '@tanstack/react-hotkeys'
import { useEffect, useRef } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'

import { nameSchema } from '../model/studio'

type RenameFormProps = {
  name: string
  onSave: (name: string) => void
  /** Escape or Cancel; the caller returns focus to its rename button. */
  onCancel: () => void
  pending: boolean
  error: unknown
}

/** Rename in place (UX-214): the field is labelled and focused, Enter saves, Escape cancels. */
export function RenameForm({ name, onSave, onCancel, pending, error }: RenameFormProps) {
  const box = useRef<HTMLFormElement>(null)
  const form = useAppForm(nameSchema, { defaultValues: { name }, onSubmit: value => onSave(value.name) })
  // Escape inside the field cancels; the hotkey is bound to this form only, not the page.
  useHotkey('Escape', onCancel, { target: box })
  useEffect(() => {
    const input = box.current?.querySelector('input')
    input?.focus()
    input?.select()
  }, [])
  return (
    <form
      ref={box}
      noValidate
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
    >
      <div className="min-w-48 flex-1">
        <form.AppField name="name">
          {field => <field.TextField label={m.studio_rename_field({ name })} required />}
        </form.AppField>
      </div>
      <Button type="submit" variant="secondary" pending={pending}>
        {m.ui_save()}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {m.ui_cancel()}
      </Button>
      {error ? <p className="w-full text-sm text-destructive">{presentError(error)}</p> : null}
    </form>
  )
}
