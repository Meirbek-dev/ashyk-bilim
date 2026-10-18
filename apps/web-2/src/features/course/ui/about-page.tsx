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
import { GuestOutline } from './guest-outline'
import { LearnerOutline } from './learner-outline'

/** The `about` tab: description (markdown), what you will learn, progress and syllabus, co-authorship. */
export function AboutPage() {
  const { courseId } = useParams({ from: '/_public/courses/$courseId/about' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const { data: session } = useSuspenseQuery(sessionOptions())
  // `about` is a plain short text; the old page showed it only when there was no description.
  const description = course.description || course.about
  return (
    <div className="flex flex-col gap-8">
      {description ? (
        <div className="max-w-prose">
          <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
            <MarkdownView content={description} />
          </Suspense>
        </div>
      ) : null}
      {course.learnings.length > 0 ? (
        <section aria-labelledby="course-learnings" className="flex flex-col gap-2">
          <h2 id="course-learnings" className="text-xl font-semibold">
            {m.course_learnings_title()}
          </h2>
          {/* Two columns of outcomes, each marked by its own emoji or a check (B-CRS-08). */}
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {course.learnings.map(learning => (
              <li key={learning.id} className="flex items-start gap-2 wrap-anywhere">
                {learning.emoji ? (
                  <span aria-hidden className="w-5 shrink-0 text-center">
                    {learning.emoji}
                  </span>
                ) : (
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
                )}
                <span>{learning.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {session ? <LearnerOutline course={course} /> : <GuestOutline courseId={courseId} />}
      {session ? <ContributorApplication course={course} userId={session.user_id} /> : null}
    </div>
  )
}
