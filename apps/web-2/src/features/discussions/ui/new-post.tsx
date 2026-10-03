import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId, DiscussionId } from '#/shared/api/gen/types.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { toast } from '#/shared/ui/toast'

import { createPostOptions, createReplyOptions } from '../queries'
import { PostForm } from './post-form'

/**
 * A new post, or with `parentId` a reply under it. One `Idempotency-Key` per post: a resubmit after a lost answer
 * reuses it, so the server never stores the post twice (BUG-153).
 */
export function NewPost({ courseId, parentId }: { courseId: CourseId; parentId?: DiscussionId }) {
  const queryClient = useQueryClient()
  const create = useMutation(
    parentId ? createReplyOptions(queryClient, courseId) : createPostOptions(queryClient, courseId),
  )
  const idempotency = useIdempotencyKey()
  const submit = (content: string) =>
    create.mutateAsync(
      {
        path: { course_id: courseId },
        body: { content, parent_id: parentId },
        headers: { 'Idempotency-Key': idempotency.key },
      },
      {
        onSuccess: () => {
          idempotency.settle()
          toast.add({ title: parentId ? m.discussions_replied() : m.discussions_published() })
        },
        onError: error => idempotency.settle(error),
      },
    )
  return (
    <PostForm
      submitLabel={parentId ? m.discussions_reply() : m.discussions_publish()}
      onSubmit={submit}
      pending={create.isPending}
      error={create.error}
    />
  )
}
