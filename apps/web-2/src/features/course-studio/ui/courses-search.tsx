import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'

import { searchBoxSchema, type CoursesSearch } from '../model/course'

/** The name search: Enter puts it in the URL (`?q=`) and keeps the preset; the page reads the URL, never this box. */
export function CoursesSearchBox({ search }: { search: CoursesSearch }) {
  const navigate = useNavigate()
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: search.q ?? '' },
    onSubmit: ({ q }) => navigate({ to: '/teach/courses', search: { ...search, q: q.trim() || undefined } }),
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
          {field => <field.TextField label={m.studio_search_label()} type="search" />}
        </form.AppField>
      </form>
    </search>
  )
}
