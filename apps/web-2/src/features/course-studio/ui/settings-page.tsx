import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { SettingsPage } from '#/shared/components/templates/settings-page'

import { can } from '../model/course'
import { courseOptions } from '../queries'
import { ArchiveSection } from './archive-section'
import { CertificateSection } from './certificate-section'
import { DeleteCourse } from './delete-course'
import { DetailsSection } from './details-section'
import { LearningsSection } from './learnings-section'
import { ThumbnailSection } from './thumbnail-section'

type Section = { id: string; label: () => string; body: ReactNode }

/**
 * `settings`: SettingsPage sections, each with its own Save: details, what you'll learn, cover, certificate,
 * archive, delete; the section nav jumps to each one (`#hash`, as in an assessment's settings).
 */
export function CourseSettingsPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/settings' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  // An archived course is read-only (writes answer 409): only restoring is offered.
  const sections: Section[] = [
    ...(can(course, 'update')
      ? [
          { id: 'details', label: m.studio_details_title, body: <DetailsSection course={course} /> },
          { id: 'learnings', label: m.studio_learnings_title, body: <LearningsSection course={course} /> },
          { id: 'cover', label: m.studio_thumbnail_title, body: <ThumbnailSection course={course} /> },
          { id: 'certificate', label: m.studio_certificate_title, body: <CertificateSection course={course} /> },
        ]
      : []),
    ...(can(course, 'archive') || can(course, 'restore')
      ? [{ id: 'archive', label: m.studio_archive_title, body: <ArchiveSection course={course} /> }]
      : []),
    ...(can(course, 'delete')
      ? [
          {
            id: 'delete',
            label: m.studio_course_delete_title,
            body: (
              <section
                aria-label={m.studio_course_delete_title()}
                className="flex max-w-prose flex-col items-start gap-4"
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold">{m.studio_course_delete_title()}</h2>
                  <p className="text-sm text-muted-foreground">{m.studio_course_delete_hint()}</p>
                </div>
                <DeleteCourse course={course} />
              </section>
            ),
          },
        ]
      : []),
  ]
  const nav =
    sections.length > 1
      ? sections.map(section => (
          <Link
            key={section.id}
            to="/teach/courses/$courseId/settings"
            params={{ courseId }}
            hash={section.id}
            variant="tab"
            activeOptions={{ includeHash: true }}
          >
            {section.label()}
          </Link>
        ))
      : undefined
  return (
    <SettingsPage title={m.studio_settings_title()} nav={nav}>
      {sections.map(section => (
        <div key={section.id} id={section.id}>
          {section.body}
        </div>
      ))}
    </SettingsPage>
  )
}
