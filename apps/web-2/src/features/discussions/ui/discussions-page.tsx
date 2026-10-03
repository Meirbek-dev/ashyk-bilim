import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { Link } from '#/shared/ui/link'

import { NewPost } from './new-post'
import { PostList } from './post-list'

/** The `discussions` tab: a guest is invited to sign in (the API reads discussions only for signed-in users). */
export function DiscussionsPage() {
  const { courseId } = useParams({ from: '/_public/courses/$courseId/discussions' })
  const { thread } = useSearch({ from: '/_public/courses/$courseId/discussions' })
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (!session)
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <p className="text-muted-foreground">{m.discussions_guest()}</p>
        <Link to="/login" search={{ redirect: `/courses/${courseId}/discussions` }} variant="outline">
          {m.platform_nav_login()}
        </Link>
      </div>
    )
  return (
    <div className="flex flex-col gap-gutter">
      <section aria-labelledby="discussions-new" className="flex max-w-prose flex-col gap-2">
        <h2 id="discussions-new" className="text-xl font-semibold">
          {m.discussions_new()}
        </h2>
        <NewPost courseId={courseId} />
      </section>
      <section aria-label={m.discussions_title()}>
        <PostList courseId={courseId} thread={thread} />
      </section>
    </div>
  )
}
