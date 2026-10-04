import type { FormEvent, ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

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
  children: ReactNode
}

/** One independent settings form: h2, a description, fields, and its own Save at the end. */
export function SettingsSection({ title, description, onSubmit, pending, error, children }: SettingsSectionProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit()
  }
  return (
    <form noValidate onSubmit={submit} aria-label={title} className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {m.ui_save()}
        </Button>
      </div>
    </form>
  )
}
