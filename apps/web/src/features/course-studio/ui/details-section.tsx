import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'

import { MarkdownEditor } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { Course, UpdateCourseRequest } from '#/shared/api/gen/types.gen'
import { vUpdateCourseRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Skeleton } from '#/shared/ui/skeleton'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/course'
import { courseVersion, updateCourseOptions } from '../queries'
import { useIfMatch } from './use-if-match'

/**
 * "Details": name, short description, the markdown description and whether co-author applications are open. Saved
 * with `If-Match: version`; a 412 opens the conflict dialog.
 */
export function DetailsSection({ course }: { course: Course }) {
  const queryClient = useQueryClient()
  const update = useMutation(updateCourseOptions(queryClient, course.id))
  const write = useIfMatch(
    (body: UpdateCourseRequest, version: number) =>
      update.mutateAsync(
        { path: { course_id: course.id }, body, headers: { 'If-Match': version } },
        { onSuccess: () => toast.add({ title: m.studio_saved() }) },
      ),
    () => courseVersion(queryClient, course.id),
  )
  // Captured once: the description editor owns its text while the user types.
  const [defaultValues] = useState<UpdateCourseRequest>(() => ({
    name: course.name,
    about: course.about,
    description: course.description,
    open_to_contributors: course.open_to_contributors,
  }))
  const form = useAppForm(vUpdateCourseRequest, {
    defaultValues,
    onSubmit: body => write.save(body, course.version),
  })
  return (
    <>
      <SettingsSection
        title={m.studio_details_title()}
        description={m.studio_details_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
        <form.AppField name="about">{field => <field.TextareaField label={m.studio_field_about()} />}</form.AppField>
        <form.AppField name="description">
          {field => (
            <Suspense fallback={<Skeleton className="h-row w-full" />}>
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
      <ConflictDialog {...write.dialog} />
    </>
  )
}
