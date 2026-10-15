import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Course, UpdateCourseRequest } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/course'
import { learningsSchema, learningsText, parseLearnings } from '../model/learnings'
import { courseVersion, updateCourseOptions } from '../queries'
import { useIfMatch } from './use-if-match'

/** "What you'll learn" (B-CST-41): one point per line, the whole list replaced on Save with `If-Match: version`. */
export function LearningsSection({ course }: { course: Course }) {
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
  const [defaultValues] = useState(() => ({ learnings: learningsText(course.learnings) }))
  const form = useAppForm(learningsSchema, {
    leaveGuard: true,
    defaultValues,
    onSubmit: ({ learnings }) => write.save({ learnings: parseLearnings(learnings) }, course.version),
  })
  return (
    <>
      <SettingsSection
        title={m.studio_learnings_title()}
        description={m.studio_learnings_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="learnings">
          {field => <field.TextareaField label={m.studio_learnings_field()} />}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog(() => form.handleSubmit())} />
    </>
  )
}
