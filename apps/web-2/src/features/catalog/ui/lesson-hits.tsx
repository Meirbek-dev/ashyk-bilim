import type { LessonHit } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { activityTypeMeta } from '#/shared/i18n/labels'

/**
 * Lessons found by name (CONTRACT-REQ-G-6): the type's icon, the lesson, then its type and course. A hit leads to the
 * course page: a learner continues from there, anyone else sees what the course is and joins it.
 */
export function LessonHits({ lessons }: { lessons: readonly LessonHit[] }) {
  return (
    <DataList variant="rows" items={lessons} getKey={lesson => lesson.activity_id}>
      {lesson => {
        const type = activityTypeMeta[lesson.activity_type]
        const Icon = type.icon
        return (
          <div className="flex items-start gap-3">
            <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${type.ink}`} />
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-medium wrap-anywhere">
                <Link to="/courses/$courseId" params={{ courseId: lesson.course_id }}>
                  {lesson.title}
                </Link>
              </h3>
              <p className="text-sm wrap-anywhere text-muted-foreground">{`${type.label()} · ${lesson.course_name}`}</p>
            </div>
          </div>
        )
      }}
    </DataList>
  )
}
