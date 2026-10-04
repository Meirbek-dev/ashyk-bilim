import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'

import { searchBoxSchema } from '../model/collections'

/** The name search. Enter puts it in the URL (`?q=`); the page reads the URL, never this box. */
export function CollectionsSearch({ q }: { q: string | undefined }) {
  const navigate = useNavigate()
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) => navigate({ to: '/collections', search: text.trim() ? { q: text.trim() } : {} }),
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
          {field => <field.TextField label={m.collections_search_label()} type="search" />}
        </form.AppField>
      </form>
    </search>
  )
}
