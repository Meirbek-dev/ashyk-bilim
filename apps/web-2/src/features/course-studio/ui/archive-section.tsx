import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { can } from '../model/course'
import { lifecycleOptions } from '../queries'
import { ArchiveCourse } from './archive-course'

/** The settings danger zone: archive an active course (confirmed), restore an archived one. */
export function ArchiveSection({ course }: { course: Course }) {
  const restore = useMutation(lifecycleOptions(useQueryClient(), course.id))
  const back = () =>
    restore.mutate(
      { path: { course_id: course.id }, body: { action: 'restore' } },
      { onSuccess: () => toast.add({ title: m.studio_restored() }) },
    )
  return (
    <section aria-label={m.studio_archive_title()} className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.studio_archive_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.studio_archive_hint()}</p>
      </div>
      {can(course, 'restore') ? (
        <SubmitButton variant="outline" onClick={back} pending={restore.isPending}>
          {m.studio_restore()}
        </SubmitButton>
      ) : null}
      {can(course, 'archive') ? <ArchiveCourse course={course} /> : null}
      {restore.error ? <ErrorAlert>{presentError(restore.error)}</ErrorAlert> : null}
    </section>
  )
}
