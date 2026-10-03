import { Suspense, type FormEvent } from 'react'
import * as v from 'valibot'

import { DiscussionEditor } from '#/features/editor'
import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { errorText } from '#/shared/components/form/field-errors'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { Spinner } from '#/shared/ui/spinner'

import { hasText } from '../model/discussions'

// The contract's `content: string`, plus the visible-text rule the server cannot apply to editor JSON.
const schema = v.object({
  content: v.pipe(
    v.string(),
    v.check(hasText, () => m.discussions_text_required()),
  ),
})

type PostFormProps = {
  /** Stored content to edit (editor JSON or legacy HTML); empty for a new post. */
  initial?: string
  submitLabel: string
  /** Gets the editor document as a JSON string; resolves when the server has answered. */
  onSubmit: (content: string) => Promise<unknown>
  pending: boolean
  error: unknown
  onCancel?: () => void
}

/** A post, reply or edit: the `discussion` editor preset, its error under it, and the form's actions. */
export function PostForm({ initial = '', submitLabel, onSubmit, pending, error, onCancel }: PostFormProps) {
  const form = useAppForm(schema, {
    defaultValues: { content: initial },
    onSubmit: async ({ content }) => {
      await onSubmit(content)
      form.reset()
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void form.handleSubmit()
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <form.Field name="content">
        {field => (
          <>
            <Suspense fallback={<Skeleton className="h-row w-full" />}>
              <DiscussionEditor content={field.state.value} onChange={doc => field.handleChange(JSON.stringify(doc))} />
            </Suspense>
            {errorText(field.state.meta.errors) ? (
              <p className="text-sm text-destructive">{errorText(field.state.meta.errors)}</p>
            ) : null}
          </>
        )}
      </form.Field>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            {m.ui_cancel()}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
