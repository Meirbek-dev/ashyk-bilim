import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'

const boxSchema = v.object({ q: v.string() })

/** The learner search box. Enter hands the text to `onSearch`, which puts it in the URL (`?q=`). */
export function LearnerSearch({
  q,
  onSearch,
}: {
  q: string | undefined
  onSearch: (q: string | undefined) => unknown
}) {
  const form = useAppForm(boxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) => onSearch(text.trim() || undefined),
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
          {field => <field.TextField label={m.grading_search_label()} type="search" />}
        </form.AppField>
      </form>
    </search>
  )
}
