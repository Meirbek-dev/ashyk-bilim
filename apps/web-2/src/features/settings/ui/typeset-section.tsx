import { useState, type FormEvent, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'

import { SectionMargin } from './section-margin'
import { page } from './section-page'

type TypesetSectionProps = {
  title: string
  /** One line on what the section changes. */
  description: ReactNode
  /** `() => form.handleSubmit()` of this section's own useAppForm. */
  onSubmit: () => Promise<void>
  pending: boolean
  /** The mutation's error: field errors are under the fields, this is the region message. */
  error: unknown
  /** The button's verb when it is not «Сохранить» («Отправить код»). */
  submitLabel?: string
  /** An anchor other pages link to (`hash`); the section lands under the sticky top bar. */
  id?: string
  children: ReactNode
}

/** One independent form of a settings page: heading in the margin, fields, and its own Save at the end. */
export function TypesetSection(props: TypesetSectionProps) {
  const { title, description, onSubmit, pending, error, submitLabel, id, children } = props
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
      className={page}
    >
      <SectionMargin title={title} description={description} />
      <div className="flex min-w-0 flex-col gap-5">
        {children}
        {error && error !== edited ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
        <div>
          <SubmitButton type="submit" pending={pending}>
            {submitLabel ?? m.ui_save()}
          </SubmitButton>
        </div>
      </div>
    </form>
  )
}
