import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'

import { EnrollButton, learnerStateOptions } from '#/features/course'
import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'

import { postsOptions } from '../queries'
import { NewPost } from './new-post'

/**
 * The composer for course members (enrolled, or the course staff: the page's `can_post`); anyone else reads the
 * discussion and is offered the enrolment instead (B-DSC-14).
 */
export function Composer({ courseId }: { courseId: CourseId }) {
  const { data } = useSuspenseInfiniteQuery(postsOptions(courseId))
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  if (data.pages[0]?.can_post) return <NewPost courseId={courseId} />
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground">{m.discussions_members_only()}</p>
      {!state.enrolled && state.permissions.can_enroll ? <EnrollButton courseId={courseId} /> : null}
    </div>
  )
}
