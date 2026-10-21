import { useState, type FormEvent, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'

import { ErrorAlert } from '../error-alert'

type SettingsSectionProps = {
  title: string
  /** One line on what the section changes. */
  description: string
  /** `() => form.handleSubmit()` of this section's own useAppForm. */
  onSubmit: () => Promise<void>
  pending: boolean
  /** The mutation's error: field errors are under the fields, this is the region message. */
  error: unknown
  /** `false` when the section saves by itself (a picked cover): no Save button. */
  saveButton?: boolean
  /** An anchor other pages link to (`hash`); the section lands under the sticky top bar. */
  id?: string
  children: ReactNode
}

/** One independent settings form: h2, a description, fields, and its own Save at the end. */
export function SettingsSection({
  title,
  description,
  onSubmit,
  pending,
  error,
  saveButton = true,
  id,
  children,
}: SettingsSectionProps) {
  // As FormDialog: the region message is about what was sent; an edit takes it away until the next failed save.
  const [edited, setEdited] = useState<unknown>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit()
  }
  return (
    <form
      id={id}
      noValidate
      onSubmit={submit}
      onInput={() => setEdited(error)}
      onChange={() => setEdited(error)}
      aria-label={title}
      className="flex max-w-prose scroll-mt-20 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      {error && error !== edited ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      {saveButton ? (
        <div>
          <SubmitButton type="submit" variant="secondary" pending={pending}>
            {m.ui_save()}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  )
}
