import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'

import { postsOptions } from '../queries'
import { NewPost } from './new-post'

/**
 * The composer for course members (enrolled, or the course staff: the page's `can_post`); anyone else reads the
 * discussion and is told to enrol with the course page's one «Записаться» button right above the tabs (B-DSC-14).
 */
export function Composer({ courseId }: { courseId: CourseId }) {
  const { data } = useSuspenseInfiniteQuery(postsOptions(courseId))
  if (data.pages[0]?.can_post) return <NewPost courseId={courseId} />
  return <p className="text-muted-foreground">{m.discussions_members_only()}</p>
}
