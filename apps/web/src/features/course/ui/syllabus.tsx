import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
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
      {chapters.map(chapter => (
        <div key={chapter.id} className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold wrap-anywhere">{chapter.title}</h3>
          <ol>
            {chapter.activities.map(activity => {
              const meta = activityTypeMeta[activityType(activity.type)]
              const Icon = meta.icon
              return (
                <li key={activity.id} className="flex min-h-row flex-wrap items-center gap-x-3 gap-y-1 border-b py-2">
                  <Icon aria-hidden className={`size-5 shrink-0 ${meta.ink}`} />
                  <span className="min-w-0 flex-1 wrap-anywhere">
                    {activity.available ? (
                      <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId: activity.id }}>
                        {activity.title}
                      </Link>
                    ) : (
                      activity.title
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">{meta.label()}</span>
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
