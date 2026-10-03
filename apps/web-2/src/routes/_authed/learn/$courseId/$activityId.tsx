import { createFileRoute } from '@tanstack/react-router'

import { ensurePlayer, PlayerError, PlayerNotFound, PlayerPage } from '#/features/player'
import { m } from '#/paraglide/messages'

// The activity player (spec 5.4): an enrolled learner only, anyone else gets a 403 in place.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId')({
  loader: ({ context, params }) => ensurePlayer(context.queryClient, params.courseId, params.activityId),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.title }] : [] }),
  staticData: { title: m.platform_page_activity, layout: 'focus' },
  component: PlayerPage,
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
