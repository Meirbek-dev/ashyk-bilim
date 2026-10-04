import { useSuspenseQuery } from '@tanstack/react-query'

import type { CourseId, DiscussionId } from '#/shared/api/gen/types.gen'

import { linkedPostOptions, opensThread } from '../queries'
import { PostRow } from './post-row'

/** A thread link to a post on a page not loaded yet: the post read alone, open, above the list. */
export function LinkedThread({ courseId, id }: { courseId: CourseId; id: DiscussionId }) {
  const { data: post } = useSuspenseQuery(linkedPostOptions(id))
  return opensThread(post, courseId) ? <PostRow post={post} open /> : null
}
