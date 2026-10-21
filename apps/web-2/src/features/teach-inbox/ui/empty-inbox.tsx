import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { CreateCourseDialog } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { ListState } from '#/shared/components/list-state'

import { emptyInbox } from '../model/inbox'
import { ownCoursesOptions } from '../queries'

const emptyTexts = {
  done: m.inbox_empty,
  first: m.inbox_empty_first,
  'no-team': m.inbox_empty_no_team,
} satisfies Record<ReturnType<typeof emptyInbox>, () => string>

/** An empty, unfiltered queue (B-INB-11): «all reviewed», or before the first course the way to create one. */
export function EmptyInbox() {
  const { data: session } = useSuspenseQuery(sessionOptions())
  // Read by the loader in exactly this case.
  const { data: own } = useSuspenseQuery(ownCoursesOptions())
  const empty = emptyInbox(own.summary?.total, hasCapability(session, 'course.create'))
  return (
    <ListState
      pending={false}
      error={null}
      count={0}
      filtered={false}
      emptyText={emptyTexts[empty]()}
      emptyAction={
        empty === 'first' ? (
          <CreateCourseDialog />
        ) : empty === 'done' ? (
          <RouterLink to="/teach/courses" className={buttonVariants({ variant: 'outline' })}>
            {m.inbox_empty_action()}
          </RouterLink>
        ) : null
      }
      onRetry={() => undefined}
    >
      {null}
    </ListState>
  )
}
