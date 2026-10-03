import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { MarkdownEditor } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { Course, UpdateCourseRequest } from '#/shared/api/gen/types.gen'
import { vUpdateCourseRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { Skeleton } from '#/shared/ui/skeleton'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { updateCourseOptions } from '../queries'

/** "Details": name, short description, the markdown description and whether co-author applications are open. */
export function DetailsSection({ course }: { course: Course }) {
  const update = useMutation(updateCourseOptions(useQueryClient(), course.id))
  // Captured once: the description editor owns its text while the user types.
  const [defaultValues] = useState<UpdateCourseRequest>(() => ({
    name: course.name,
    about: course.about,
    description: course.description,
    open_to_contributors: course.open_to_contributors,
  }))
  const form = useAppForm(vUpdateCourseRequest, {
    defaultValues,
    onSubmit: body =>
      update.mutateAsync({ path: { id: course.id }, body }, { onSuccess: () => toast(m.studio_saved()) }),
  })
  return (
    <SettingsSection
      title={m.studio_details_title()}
      description={m.studio_details_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
      <form.AppField name="about">{field => <field.TextareaField label={m.studio_field_about()} />}</form.AppField>
      <form.AppField name="description">
        {field => (
          <Suspense fallback={<Skeleton shape="row" />}>
            <MarkdownEditor
              label={m.studio_field_description()}
              value={field.state.value ?? ''}
              onChange={field.handleChange}
            />
          </Suspense>
        )}
      </form.AppField>
      <form.AppField name="open_to_contributors">
        {field => <field.SwitchField label={m.studio_field_open()} description={m.studio_field_open_hint()} />}
      </form.AppField>
    </SettingsSection>
  )
}
