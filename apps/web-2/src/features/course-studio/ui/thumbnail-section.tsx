import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Course, UpdateCourseRequest } from '#/shared/api/gen/types.gen'
import { vUpdateCourseRequest } from '#/shared/api/gen/valibot.gen'
import { FileField } from '#/shared/components/form/file-field'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/course'
import { courseVersion, updateCourseOptions } from '../queries'
import { useIfMatch } from './use-if-match'

const defaultValues: UpdateCourseRequest = { thumbnail_upload_id: undefined }

/** "Cover": the current image, a new one uploaded as `course-thumbnail` and claimed on Save, or removed. */
export function ThumbnailSection({ course }: { course: Course }) {
  const queryClient = useQueryClient()
  const update = useMutation(updateCourseOptions(queryClient, course.id))
  const write = useIfMatch(
    (body: UpdateCourseRequest, version: number) =>
      update.mutateAsync(
        { path: { course_id: course.id }, body, headers: { 'If-Match': version } },
        {
          onSuccess: () =>
            toast.add({ title: body.thumbnail_upload_id === null ? m.studio_thumbnail_removed() : m.studio_saved() }),
        },
      ),
    () => courseVersion(queryClient, course.id),
  )
  const form = useAppForm(vUpdateCourseRequest, {
    defaultValues,
    onSubmit: body => write.save(body, course.version),
  })
  // Other errors are on `update.error` (shown by the section).
  const remove = () => void write.save({ thumbnail_upload_id: null }, course.version).catch(() => undefined)
  return (
    <>
      <SettingsSection
        title={m.studio_thumbnail_title()}
        description={m.studio_thumbnail_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        {course.thumbnail_key ? (
          <div className="flex flex-col items-start gap-2">
            <img
              src={`/content/${course.thumbnail_key}`}
              alt={m.studio_thumbnail_alt()}
              className="aspect-video w-full max-w-sm rounded-lg border object-cover"
            />
            <Button variant="outline" onClick={remove} disabled={update.isPending}>
              {m.studio_thumbnail_remove()}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{m.studio_thumbnail_none()}</p>
        )}
        <form.AppField name="thumbnail_upload_id">
          {() => (
            <FileField
              label={m.studio_thumbnail_field()}
              description={m.studio_thumbnail_types()}
              purpose="course-thumbnail"
            />
          )}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
    </>
  )
}
