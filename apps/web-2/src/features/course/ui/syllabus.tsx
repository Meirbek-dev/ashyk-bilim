import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { formatNumber } from '#/shared/i18n/format'
import { activityTypeMeta } from '#/shared/i18n/labels'

import { syllabusSize, type SyllabusChapter } from '../model/course'
import { SyllabusRow } from './syllabus-row'

/**
 * Chapters and their activities in order, threaded on one seam: solid where the learner is done, dashed ahead (the
 * stitch of the course ornament). An activity the learner may open links into the player; the whole row is the link.
 */
export function Syllabus({ courseId, chapters }: { courseId: CourseId; chapters: SyllabusChapter[] }) {
  const size = syllabusSize(chapters)
  return (
    <section aria-labelledby="course-syllabus" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="course-syllabus" className="text-xl font-semibold">
          {m.course_syllabus_title()}
        </h2>
        {/* The size of the course at a glance (B-CRS-14): chapters and activities as listed below. */}
        {chapters.length > 0 ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {m.course_chapters_count({ count: chapters.length })} ·{' '}
            {m.course_activities_count({ count: size.activities })}
          </p>
        ) : null}
        {/* What it is made of (B-CRS-15): each type's tile and «Видео: 12». */}
        {size.byType.length > 1 ? (
          <ul aria-label={m.course_composition()} className="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-sm">
            {size.byType.map(([type, count]) => (
              <li key={type} className="flex items-center gap-2">
                <ActivityIcon type={type} size="sm" />
                <span className="tabular-nums">
                  {activityTypeMeta[type].label()}: {formatNumber(count)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
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
