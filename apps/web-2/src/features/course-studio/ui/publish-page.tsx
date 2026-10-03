import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'

import { can, courseStatus } from '../model/course'
import { courseOptions, lifecycleOptions, readinessOptions } from '../queries'
import { CourseStatusBadge } from './course-status'
import { ReadinessList } from './readiness-list'
import { UnpublishCourse } from './unpublish-course'
import { UpdatesSection } from './updates-section'

/** `publish`: status and readiness, publish (only without blockers) or unpublish, then the announcements. */
export function PublishPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/publish' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const { data: readiness } = useSuspenseQuery(readinessOptions(courseId))
  const publish = useMutation(lifecycleOptions(useQueryClient(), courseId))
  const go = () =>
    publish.mutate(
      { path: { course_id: courseId }, body: { action: 'publish' } },
      { onSuccess: () => toast(m.studio_published()) },
    )
  return (
    <div className="flex max-w-prose flex-col gap-12">
      <section aria-label={m.studio_publish_title()} className="flex flex-col items-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{m.studio_publish_title()}</h2>
          <CourseStatusBadge status={courseStatus(course)} />
        </div>
        <ReadinessList courseId={courseId} />
        {can(course, 'publish') ? (
          <>
            {readiness.ready ? null : <p className="text-sm text-muted-foreground">{m.studio_publish_blocked()}</p>}
            <Button pending={publish.isPending} disabled={!readiness.ready} onClick={go}>
              {m.studio_publish()}
            </Button>
          </>
        ) : null}
        {can(course, 'unpublish') ? <UnpublishCourse course={course} /> : null}
        {publish.error ? <Alert>{presentError(publish.error)}</Alert> : null}
      </section>
      <UpdatesSection course={course} />
    </div>
  )
}
