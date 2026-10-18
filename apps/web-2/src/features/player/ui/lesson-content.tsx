import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { BlockViewer, VideoEndedContext } from '#/features/editor'
import { m } from '#/paraglide/messages'
import type { ActivityId } from '#/shared/api/gen/types.gen'
import { Skeleton } from '#/shared/ui/skeleton'

import { lessonDocument, pageWithOutline } from '../model/lesson'
import { PageOutline } from './page-outline'
import { activityOptions } from '../queries'

/**
 * A page, video or document through the editor's view preset (its video player, YouTube embed and PDF frame).
 * `onVideoEnded`: a hosted video played to the end (the player marks the lesson done).
 */
// Text-shaped placeholder while the viewer loads and its editor is created (no empty flash before the lesson).
const lines = (
  <div aria-hidden className="flex flex-col gap-3">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-11/12" />
    <Skeleton className="h-4 w-2/3" />
  </div>
)

export function LessonContent({ activityId, onVideoEnded }: { activityId: ActivityId; onVideoEnded?: () => void }) {
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const content = lessonDocument(activity.activity_type, activity.activity_sub_type, activity.content)
  if (!content) return <p className="text-muted-foreground">{m.player_empty()}</p>
  const page = pageWithOutline(content)
  return (
    <>
      {page.outline.length > 0 ? <PageOutline outline={page.outline} /> : null}
      <Suspense fallback={lines}>
        <VideoEndedContext value={onVideoEnded ?? null}>
          <BlockViewer content={page.content} fallback={lines} />
        </VideoEndedContext>
      </Suspense>
    </>
  )
}
