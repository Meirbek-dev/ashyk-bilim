import { createFileRoute } from '@tanstack/react-router'

import { CompletionPage, ensureCompletion, PlayerError, PlayerNotFound } from '#/features/player'
import { m } from '#/paraglide/messages'

// The course summary: an enrolled learner only, anyone else gets a 403 in place.
export const Route = createFileRoute('/_authed/learn/$courseId/complete')({
  loader: ({ context, params }) => ensureCompletion(context.queryClient, params.courseId),
  staticData: { title: m.platform_page_course_complete, layout: 'focus' },
  component: CompletionPage,
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
