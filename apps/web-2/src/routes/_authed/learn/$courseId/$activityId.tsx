import { createFileRoute } from '@tanstack/react-router'

import { AiPanel, aiSearchSchema, prefetchPanel } from '#/features/ai'
import { ensurePlayer, PlayerError, PlayerNotFound, PlayerPage } from '#/features/player'
import { m } from '#/paraglide/messages'

// The activity player (spec 5.4): an enrolled learner only, anyone else gets a 403 in place. The AI panel is its
// right slot (slice 6.3); its tab and thread live in the search params.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId')({
  validateSearch: aiSearchSchema,
  loader: async ({ context, params }) => {
    const player = await ensurePlayer(context.queryClient, params.courseId, params.activityId)
    await prefetchPanel(context.queryClient, { ...params, surface: 'student-activity' })
    return player
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.title }] : [] }),
  staticData: { title: m.platform_page_activity, layout: 'focus' },
  component: function Player() {
    const params = Route.useParams()
    return (
      <PlayerPage aside={{ label: m.ai_panel_title(), content: <AiPanel {...params} surface="student-activity" /> }} />
    )
  },
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
