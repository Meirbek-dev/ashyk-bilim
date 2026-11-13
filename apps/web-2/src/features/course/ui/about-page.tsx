import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { Skeleton } from '#/shared/ui/skeleton'

import { courseOptions } from '../queries'
import { ContributorApplication } from './contributor-application'
import { CourseTeam } from './course-team'
import { GuestOutline } from './guest-outline'
import { LearnerOutline } from './learner-outline'
import { LeaveCourseRow } from './leave-course-row'

/**
 * The `about` tab: description (markdown), what you will learn, progress and syllabus, the team, co-authorship, and
 * for an enrolled learner the way out of the course as the page's last line. Sections stand one step apart (`gap-12`),
 * each title one step over its content.
 */
export function AboutPage() {
  const { courseId } = useParams({ from: '/_public/courses/$courseId/about' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const { data: session } = useSuspenseQuery(sessionOptions())
  // `about` is a plain short text; the old page showed it only when there was no description.
  const text = course.description || course.about
  const description = text ? (
    <div className="max-w-prose">
      <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
        <MarkdownView content={text} />
      </Suspense>
    </div>
  ) : null
  const learnings =
    course.learnings.length > 0 ? (
      <section aria-labelledby="course-learnings" className="flex flex-col gap-4">
        <h2 id="course-learnings" className="text-xl font-semibold">
          {m.course_learnings_title()}
        </h2>
        {/* Two columns of outcomes, each marked by its own emoji or a check (B-CRS-08). */}
        <ul className="grid gap-x-12 gap-y-3 sm:grid-cols-2">
          {course.learnings.map(learning => (
            <li key={learning.id} className="flex items-start gap-3 text-pretty wrap-anywhere">
              {learning.emoji ? (
                <span aria-hidden className="w-5 shrink-0 text-center">
                  {learning.emoji}
                </span>
              ) : (
                <span className="flex h-lh w-5 shrink-0 items-center justify-center">
                  <Check aria-hidden className="size-4 text-muted-foreground" />
                </span>
              )}
              <span>{learning.text}</span>
            </li>
          ))}
        </ul>
      </section>
    ) : null
  return (
    <div className="flex flex-col gap-12 pt-2">
      {session ? (
        <LearnerOutline course={course} description={description} learnings={learnings} />
      ) : (
        <>
          {description}
          {learnings}
          <GuestOutline courseId={courseId} />
        </>
      )}
      {session ? <CourseTeam courseId={courseId} /> : null}
      {session ? <ContributorApplication course={course} userId={session.user_id} /> : null}
      {session ? <LeaveCourseRow course={course} /> : null}
    </div>
  )
}
