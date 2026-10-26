import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { copySourcesOptions } from '../queries'
import type { CreateCourseFormApi } from './create-course-dialog'

/**
 * "Start from": a blank course or a copy of one of the caller's courses (read when the dialog opens). A teacher with no
 * course yet has nothing to copy: the field and its note about copies stay out of their first course's dialog.
 */
export function SourceField({ form }: { form: CreateCourseFormApi }) {
  const { data } = useSuspenseQuery(copySourcesOptions())
  if (data.items.length === 0) return null
  return (
    <form.AppField name="source">
      {field => (
        <field.SelectField
          label={m.studio_field_source()}
          description={m.studio_field_source_hint()}
          options={[
            { value: '', label: m.studio_source_blank() },
            ...data.items.map(course => ({ value: course.id, label: course.name })),
          ]}
        />
      )}
    </form.AppField>
  )
}
