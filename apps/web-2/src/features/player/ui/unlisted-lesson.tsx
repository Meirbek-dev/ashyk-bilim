import { useSuspenseQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { FocusPage } from '#/shared/components/templates/focus-page'
import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'
import { activityTypeMeta } from '#/shared/i18n/labels'

import { activityKind } from '../model/player'
import { activityOptions } from '../queries'
import { BackToCourse } from './back-to-course'
import { LessonContent } from './lesson-content'
import { PlayerNotFound } from './player-not-found'
import { PreviewNote } from './preview-note'

type UnlistedLessonProps = {
  courseId: CourseId
  activityId: ActivityId
  title: string
  aside?: { label: string; content: ReactNode } | undefined
}

/**
 * A lesson the outline does not list (unpublished), opened by course staff as a preview (B-PLY-01): its content
 * from its own read, no mark, no neighbours. Anything else stays "not found".
 */
export function UnlistedLesson({ courseId, activityId, title, aside }: UnlistedLessonProps) {
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  if (activity.course_id !== courseId || activityKind(activity.activity_type) !== 'lesson') return <PlayerNotFound />
  const meta = activityTypeMeta[activity.activity_type]
  const Icon = meta.icon
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={title} aside={aside}>
      <article className="flex flex-col gap-gutter">
        <PreviewNote />
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon aria-hidden className={`size-4 ${meta.ink}`} />
            {meta.label()}
          </p>
          <h1 className="text-2xl font-semibold wrap-anywhere">{activity.name}</h1>
        </header>
        <LessonContent activityId={activity.id} onVideoEnded={() => undefined} />
      </article>
    </FocusPage>
  )
}
