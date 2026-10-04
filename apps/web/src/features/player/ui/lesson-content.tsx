import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { BlockViewer } from '#/features/editor'
import { m } from '#/paraglide/messages'
import type { ActivityId } from '#/shared/api/gen/types.gen'
import { Skeleton } from '#/shared/ui/skeleton'

import { lessonDocument } from '../model/lesson'
import { activityOptions } from '../queries'

/** A page, video or document through the editor's view preset (its video player, YouTube embed and PDF frame). */
export function LessonContent({ activityId }: { activityId: ActivityId }) {
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const content = lessonDocument(activity.activity_type, activity.activity_sub_type, activity.content)
  if (!content) return <p className="text-muted-foreground">{m.player_empty()}</p>
  return (
    <Suspense fallback={<Skeleton className="h-row w-full" />}>
      <BlockViewer content={content} />
    </Suspense>
  )
}
