import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'

import { can } from '../model/course'
import { lifecycleOptions } from '../queries'
import { ArchiveCourse } from './archive-course'

/** The settings danger zone: archive an active course (confirmed), restore an archived one. */
export function ArchiveSection({ course }: { course: Course }) {
  const restore = useMutation(lifecycleOptions(useQueryClient(), course.id))
  const back = () =>
    restore.mutate(
      { path: { course_id: course.id }, body: { action: 'restore' } },
      { onSuccess: () => toast(m.studio_restored()) },
    )
  return (
    <section aria-label={m.studio_archive_title()} className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.studio_archive_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.studio_archive_hint()}</p>
      </div>
      {can(course, 'restore') ? (
        <Button variant="outline" pending={restore.isPending} onClick={back}>
          {m.studio_restore()}
        </Button>
      ) : null}
      {can(course, 'archive') ? <ArchiveCourse course={course} /> : null}
      {restore.error ? <Alert>{presentError(restore.error)}</Alert> : null}
    </section>
  )
}
