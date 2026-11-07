import { useSuspenseQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'

import { CreateCourseDialog } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { ListState } from '#/shared/components/list-state'

import { emptyInbox } from '../model/inbox'
import { ownCoursesOptions } from '../queries'

const emptyTexts = {
  done: m.inbox_empty,
  first: m.inbox_empty_first,
  'no-team': m.inbox_empty_no_team,
} satisfies Record<ReturnType<typeof emptyInbox>, () => string>

/** An empty, unfiltered queue (B-INB-11): «all reviewed» (the courses follow under it), or before the first course
 * the way to create one. */
export function EmptyInbox() {
  const { data: session } = useSuspenseQuery(sessionOptions())
  // Read by the loader in exactly this case.
  const { data: own } = useSuspenseQuery(ownCoursesOptions())
  const empty = emptyInbox(own.summary?.total, hasCapability(session, 'course.create'))
  if (empty === 'done')
    return (
      <p className="flex items-start gap-3 text-base">
        <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
        {emptyTexts.done()}
      </p>
    )
  return (
    <ListState
      pending={false}
      error={null}
      count={0}
      filtered={false}
      emptyText={emptyTexts[empty]()}
      emptyAction={empty === 'first' ? <CreateCourseDialog /> : null}
      onRetry={() => undefined}
    >
      {null}
    </ListState>
  )
}
