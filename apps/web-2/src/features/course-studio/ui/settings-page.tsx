import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { can } from '../model/course'
import { courseOptions } from '../queries'
import { ArchiveSection } from './archive-section'
import { CertificateSection } from './certificate-section'
import { DetailsSection } from './details-section'
import { ThumbnailSection } from './thumbnail-section'

/** `settings`: the sections of SettingsPage, each with its own Save: details, cover, certificate, archive. */
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
    </div>
  )
}
