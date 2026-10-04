import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/ui/button'

import { activityOptions } from '../curriculum-queries'
import { MediaFileSection } from './media-file-section'
import { PageEditor } from './page-editor'
import { YoutubeSection } from './youtube-section'

/**
 * `edit`: a page gets the block editor, a video or PDF its source. Quiz, exam, code and file-submission activities
 * never get here (the route hands them to their builders). A legacy `custom` activity has no editor (B-CST-34): saving
 * its document would not claim its uploads (the server does that for pages only), so only its name changes.
 */
export function ActivityEditPage() {
  const { courseId, activityId } = useParams({
    from: '/_authed/teach/courses/$courseId_/activities/$activityId/edit',
  })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  if (activity.activity_type === 'dynamic')
    return <PageEditor key={activity.id} courseId={courseId} activity={activity} />
  if (activity.activity_sub_type === 'video_youtube') return <YoutubeSection courseId={courseId} activity={activity} />
  if (activity.activity_type === 'video' || activity.activity_type === 'document')
    return <MediaFileSection courseId={courseId} activity={activity} />
  return (
    <div className="flex max-w-prose flex-col items-start gap-4">
      <p className="text-muted-foreground">{m.studio_custom_no_editor()}</p>
      <RouterLink
        to="/teach/courses/$courseId/activities/$activityId/settings"
        params={{ courseId, activityId }}
        className={buttonVariants({ variant: 'outline' })}
      >
        {m.studio_custom_open_settings()}
      </RouterLink>
    </div>
  )
}
