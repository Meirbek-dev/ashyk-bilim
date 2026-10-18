import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import type { SyllabusChapter } from '../model/course'
import { SyllabusRow } from './syllabus-row'

/**
 * Chapters and their activities in order, threaded on one seam: solid where the learner is done, dashed ahead (the
 * stitch of the course ornament). An activity the learner may open links into the player; the whole row is the link.
 */
export function Syllabus({ courseId, chapters }: { courseId: CourseId; chapters: SyllabusChapter[] }) {
  return (
    <section aria-labelledby="course-syllabus" className="flex flex-col gap-6">
      <h2 id="course-syllabus" className="text-xl font-semibold">
        {m.course_syllabus_title()}
      </h2>
      {chapters.length === 0 ? <p className="text-muted-foreground">{m.course_syllabus_empty()}</p> : null}
      <div className="flex flex-col gap-8">
        {chapters.map((chapter, index) => {
          const done = chapter.activities.filter(activity => activity.complete).length
          const total = chapter.activities.length
          const tracked = chapter.activities.some(activity => activity.available)
          const finished = total > 0 && done === total
          return (
            <div key={chapter.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`grid size-7 shrink-0 place-items-center rounded-full font-heading text-sm font-semibold tabular-nums ${finished ? 'bg-primary text-primary-foreground' : 'border-2 border-input bg-background'}`}
                >
                  {finished ? <Check className="size-4" /> : index + 1}
                </span>
                <h3 className="min-w-0 flex-1 text-lg font-semibold wrap-anywhere">{chapter.title}</h3>
                {tracked ? (
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {formatNumber(done)}/{formatNumber(total)}
                  </span>
                ) : null}
              </div>
              <ol className="ml-3.5">
                {chapter.activities.map(activity => (
                  <SyllabusRow key={activity.id} courseId={courseId} activity={activity} />
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </section>
  )
}
