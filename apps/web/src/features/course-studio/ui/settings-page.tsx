import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { can } from '../model/course'
import { courseOptions } from '../queries'
import { ArchiveSection } from './archive-section'
import { CertificateSection } from './certificate-section'
import { DeleteCourse } from './delete-course'
import { DetailsSection } from './details-section'
import { ThumbnailSection } from './thumbnail-section'

/** `settings`: the sections of SettingsPage, each with its own Save: details, cover, certificate, archive, delete. */
export function CourseSettingsPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/settings' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  return (
    <div className="flex flex-col gap-12">
      {/* An archived course is read-only (writes answer 409): only restoring is offered. */}
      {can(course, 'update') ? (
        <>
          <DetailsSection course={course} />
          <ThumbnailSection course={course} />
          <CertificateSection course={course} />
        </>
      ) : null}
      {can(course, 'archive') || can(course, 'restore') ? <ArchiveSection course={course} /> : null}
      {can(course, 'delete') ? (
        <section aria-label={m.studio_course_delete_title()} className="flex max-w-prose flex-col items-start gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">{m.studio_course_delete_title()}</h2>
            <p className="text-sm text-muted-foreground">{m.studio_course_delete_hint()}</p>
          </div>
          <DeleteCourse course={course} />
        </section>
      ) : null}
    </div>
  )
}
