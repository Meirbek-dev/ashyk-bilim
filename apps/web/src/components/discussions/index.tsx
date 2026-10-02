'use client'

import type { Discussion } from '@/services/courses/discussions'
import DiscussionList from './discussion-list'

interface CourseDiscussionsProps {
  initialPosts: Discussion[]
  currentUser: AppUserSummary | null
  courseUuid: string
  onMutate?: () => void
  /** Archived course: the thread is readable, nothing can be posted or voted. */
  readOnly?: boolean
}

export default function CourseDiscussions({
  initialPosts,
  currentUser,
  courseUuid,
  onMutate,
  readOnly = false,
}: CourseDiscussionsProps) {
  return (
    <div className="my-8">
      <DiscussionList
        initialPosts={initialPosts}
        currentUser={currentUser}
        courseUuid={courseUuid}
        readOnly={readOnly}
        {...(onMutate === undefined ? {} : { onMutate })}
      />
    </div>
  )
}
