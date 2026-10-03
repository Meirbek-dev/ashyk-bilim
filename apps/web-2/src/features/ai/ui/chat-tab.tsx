import { useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'

import type { ActivityId, AiThreadId, CourseId } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'

import { Conversation } from './conversation'
import { ThreadList } from './thread-list'

type ChatTabProps = { courseId: CourseId; activityId: ActivityId | undefined; threadId: AiThreadId | undefined }

/** Course Q&A: the threads and the open one; the thread lives in `?aiThread=` (R-07). */
export function ChatTab({ courseId, activityId, threadId }: ChatTabProps) {
  const navigate = useNavigate()
  const select = (id: AiThreadId | undefined) =>
    void navigate({ to: '.', search: prev => ({ ...prev, aiThread: id }), replace: true })
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton />}>
        {/* Keyed by thread: another thread starts with no turn in flight (the stream of the old one is aborted). */}
        <Conversation
          key={threadId ?? 'new'}
          courseId={courseId}
          activityId={activityId}
          threadId={threadId}
          onThread={select}
        />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <ThreadList courseId={courseId} threadId={threadId} onSelect={select} />
      </Suspense>
    </div>
  )
}
