import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'
import { activityType, activityTypeMeta } from '#/shared/i18n/labels'

import type { SyllabusChapter } from '../model/course'

/** Chapters and their activities in order; an activity the learner may open links into the player. */
export function Syllabus({ courseId, chapters }: { courseId: CourseId; chapters: SyllabusChapter[] }) {
  return (
    <section aria-labelledby="course-syllabus" className="flex flex-col gap-4">
      <h2 id="course-syllabus" className="text-xl font-semibold">
        {m.course_syllabus_title()}
      </h2>
      {chapters.length === 0 ? <p className="text-muted-foreground">{m.course_syllabus_empty()}</p> : null}
      {chapters.map((chapter, index) => (
        <div key={chapter.id} className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
          <div className="flex items-center gap-3 border-b bg-muted px-4 py-3">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full border bg-background font-heading text-sm font-semibold tabular-nums"
            >
              {index + 1}
            </span>
            <h3 className="text-lg font-semibold wrap-anywhere">{chapter.title}</h3>
          </div>
          <ol className="divide-y">
            {chapter.activities.map(activity => {
              const type = activityType(activity.type)
              return (
                <li key={activity.id} className="flex min-h-row flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <ActivityIcon type={type} size="sm" />
                  <span className="min-w-0 grow basis-48 wrap-anywhere">
                    {activity.available ? (
                      <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId: activity.id }}>
                        {activity.title}
                      </Link>
                    ) : (
                      activity.title
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">{activityTypeMeta[type].label()}</span>
                  {activity.opensAt ? (
                    <span className="text-sm text-muted-foreground">
                      {m.course_activity_opens({ date: formatDateTime(activity.opensAt) })}
                    </span>
                  ) : null}
                  {activity.complete ? (
                    <StatusBadge tone="success">
                      <Check aria-hidden className="size-3" />
                      {m.course_activity_done()}
                    </StatusBadge>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}
