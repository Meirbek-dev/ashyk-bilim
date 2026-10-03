import { createFileRoute } from '@tanstack/react-router'

import { DiscussionsPage, discussionsSearchSchema, ensureDiscussions } from '#/features/discussions'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/courses/$courseId/discussions')({
  validateSearch: discussionsSearchSchema,
  loaderDeps: ({ search }) => ({ thread: search.thread }),
  // A guest gets the sign-in invitation: the API answers 401 to them.
  loader: ({ context, params, deps }) =>
    context.session ? ensureDiscussions(context.queryClient, params.courseId, deps.thread) : null,
  staticData: { title: m.platform_tab_discussions },
  component: DiscussionsPage,
})
