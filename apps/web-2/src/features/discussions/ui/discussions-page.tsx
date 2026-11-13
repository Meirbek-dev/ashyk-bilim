import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch, Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { EmptyState } from '#/shared/components/empty-state'

import { Composer } from './composer'
import { PostList } from './post-list'

/** The `discussions` tab: a guest is invited to sign in (the API reads discussions only for signed-in users). */
export function DiscussionsPage() {
  const { courseId } = useParams({ from: '/_public/courses/$courseId/discussions' })
  const { thread } = useSearch({ from: '/_public/courses/$courseId/discussions' })
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (!session)
    return (
      // The tab's whole content for a guest: the quiet field of an empty region, with the way in.
      <EmptyState
        action={
          <RouterLink
            to="/login"
            search={{ redirect: `/courses/${courseId}/discussions` }}
            className={buttonVariants({ variant: 'outline' })}
          >
            {m.platform_nav_login()}
          </RouterLink>
        }
      >
        {m.discussions_guest()}
      </EmptyState>
    )
  return (
    <div className="flex max-w-[46rem] flex-col gap-gutter">
      <section aria-labelledby="discussions-new" className="flex flex-col gap-4">
        <h2 id="discussions-new" className="text-xl font-semibold">
          {m.discussions_new()}
        </h2>
        <Composer courseId={courseId} />
      </section>
      <section aria-label={m.discussions_title()}>
        <PostList courseId={courseId} thread={thread} />
      </section>
    </div>
  )
}
