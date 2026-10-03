import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'

import { activityOptions } from '../curriculum-queries'
import { MediaFileSection } from './media-file-section'
import { PageEditor } from './page-editor'
import { YoutubeSection } from './youtube-section'

/**
 * `edit`: a page gets the block editor, a video or PDF its source. Quiz, exam, code and file-submission builders
 * are slices 5.1, 5.3 and 5.4 (their activity record has no fields of its own): the tab stays a stub for them.
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
  return <UnderConstruction />
}
