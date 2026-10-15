import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'

import { searchBoxSchema } from '../model/course'

/** The roster search: Enter puts it in the URL (`?q=`); the list reads the URL, never this box. */
export function LearnersSearchBox({ q }: { q: string | undefined }) {
  const navigate = useNavigate()
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) => navigate({ to: '.', search: { q: text.trim() || undefined } }),
  })
  return (
    <search className="w-full max-w-sm">
      <form
        onSubmit={event => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppField name="q">
          {field => <field.TextField label={m.studio_learners_search()} type="search" />}
        </form.AppField>
      </form>
    </search>
  )
}
