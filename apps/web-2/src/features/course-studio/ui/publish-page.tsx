import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Link } from '#/shared/components/link'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

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
  const status = courseStatus(course)
  const go = () =>
    publish.mutate(
      { path: { course_id: courseId }, body: { action: 'publish' } },
      { onSuccess: () => toast.add({ title: m.studio_published() }) },
    )
  return (
    <div className="flex max-w-prose flex-col gap-12">
      <section aria-label={m.studio_publish_title()} className="flex flex-col items-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{m.studio_publish_title()}</h2>
          <CourseStatusBadge status={status} />
        </div>
        {/* A live course says where learners find it, not that it is "ready to publish" (B-CST-05). */}
        {status === 'published' ? (
          <p className="flex flex-wrap gap-x-2">
            <span>{m.studio_publish_live()}</span>
            <Link to="/courses/$courseId" params={{ courseId }}>
              {m.studio_publish_open_page()}
            </Link>
            {/* The step after publishing: a first course has nobody on it yet (UX-admin first-run). */}
            <Link to="/teach/courses/$courseId/learners" params={{ courseId }}>
              {m.studio_roster_title()}
            </Link>
          </p>
        ) : null}
        {/* An archived course is read-only: what blocks publishing is moot until it is restored. */}
        {status === 'archived' ? (
          <p className="flex flex-wrap gap-x-2">
            <span>{m.studio_publish_archived()}</span>
            <Link to="/teach/courses/$courseId/settings" params={{ courseId }} hash="archive">
              {m.studio_go_settings()}
            </Link>
          </p>
        ) : (
          <ReadinessList courseId={courseId} live={status !== 'draft'} />
        )}
        {can(course, 'publish') ? (
          <>
            {readiness.ready ? null : <p className="text-sm text-muted-foreground">{m.studio_publish_blocked()}</p>}
            <SubmitButton pending={publish.isPending} disabled={!readiness.ready} onClick={go}>
              {m.studio_publish()}
            </SubmitButton>
          </>
        ) : null}
        {can(course, 'unpublish') ? <UnpublishCourse course={course} /> : null}
        {publish.error ? <ErrorAlert>{presentError(publish.error)}</ErrorAlert> : null}
      </section>
      <UpdatesSection course={course} />
    </div>
  )
}
