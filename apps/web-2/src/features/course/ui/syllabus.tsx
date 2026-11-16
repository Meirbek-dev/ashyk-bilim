import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { EmptyState } from '#/shared/components/empty-state'
import { formatNumber } from '#/shared/i18n/format'
import { activityTypeMeta } from '#/shared/i18n/labels'

import { syllabusSize, type SyllabusChapter } from '../model/course'
import { SyllabusRow } from './syllabus-row'

type SyllabusProps = {
  courseId: CourseId
  chapters: SyllabusChapter[]
  /** Facts that belong to the programme when no progress block stands over it (what finishing earns). */
  note?: ReactNode
  /** Rows open for reading without an enrolment (`guest_access`): they link, but nothing is counted or marked. */
  open?: boolean
}

/**
 * Chapters and their activities in order, one under another. An
 * activity the learner may open links into the player; the whole row is the link.
 */
export function Syllabus({ courseId, chapters, note, open = false }: SyllabusProps) {
  const size = syllabusSize(chapters)
  // A guest's or a visitor's programme has nothing to mark: the rows then end on the type, flush with the rules.
  const marks = !open && chapters.some(chapter => chapter.activities.some(activity => activity.available))
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
        {size.byType.length > 1 && size.activities > 5 ? (
          <ul aria-label={m.course_composition()} className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-sm">
            {size.byType.map(([type, count]) => (
              <li key={type} className="flex items-center gap-1.5">
                <ActivityIcon type={type} size="sm" />
                <span className="tabular-nums">
                  {activityTypeMeta[type].label()}: {formatNumber(count)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {note ? <div className="pt-2">{note}</div> : null}
      </div>
      {/* Nothing published yet: the quiet field of an empty list, where one grey line read as a page cut short. */}
      {chapters.length === 0 ? <EmptyState>{m.course_syllabus_empty()}</EmptyState> : null}
      <div className="flex flex-col gap-8 empty:hidden">
        {chapters.map((chapter, index) => {
          const done = chapter.activities.filter(activity => activity.complete).length
          const total = chapter.activities.length
          const tracked = !open && chapter.activities.some(activity => activity.available)
          const finished = total > 0 && done === total
          return (
            <div key={chapter.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-3 border-b pb-2.5">
                <span
                  aria-hidden
                  className={`w-7 shrink-0 font-heading text-lg tabular-nums ${finished ? 'text-success' : 'text-muted-foreground'}`}
                >
                  {finished ? <Check className="size-5 translate-y-0.5" /> : index + 1}
                </span>
                <h3 className="min-w-0 flex-1 text-lg font-semibold wrap-anywhere">{chapter.title}</h3>
                {tracked ? (
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {formatNumber(done)}/{formatNumber(total)}
                  </span>
                ) : null}
              </div>
              <ol>
                {chapter.activities.map(activity => (
                  <SyllabusRow key={activity.id} courseId={courseId} activity={activity} marks={marks} />
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </section>
  )
}
