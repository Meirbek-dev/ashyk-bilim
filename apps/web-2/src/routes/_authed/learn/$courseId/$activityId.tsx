import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { AiPanel, prefetchPanel } from '#/features/ai'
import { aiSearchSchema } from '#/features/ai/route'
import { ensurePlayer, PlayerError, PlayerNotFound, PlayerPage } from '#/features/player'
import { m } from '#/paraglide/messages'
import { documentTitle } from '#/shared/lib/document-title'

// The activity player (spec 5.4): an enrolled learner only, anyone else gets a 403 in place. The AI panel is its
// right slot (slice 6.3); its tab and thread live in the search params. Where the AI is off for the activity the
// column and its phone sheet are left out (B-AI-02): a 384 px column for one line of "unavailable" is dead space.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId')({
  validateSearch: aiSearchSchema,
  // The AI capabilities do not wait for the player's reads (a refused player discards them).
  loader: async ({ context, params }) => {
    const [player, ai] = await Promise.all([
      ensurePlayer(context.queryClient, params.courseId, params.activityId),
      prefetchPanel(context.queryClient, { ...params, surface: 'student-activity' }),
    ])
    return { ...player, aiOff: ai?.available === false }
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: documentTitle(loaderData.title) }] : [] }),
  staticData: { title: m.platform_page_activity, layout: 'focus' },
  component: function Player() {
    const params = Route.useParams()
    const { aiOff } = Route.useLoaderData()
    return (
      <PlayerPage
        aside={
          aiOff
            ? undefined
            : {
                label: m.ai_panel_title(),
                content: (
                  <Suspense>
                    <AiPanel {...params} surface="student-activity" />
                  </Suspense>
                ),
              }
        }
      />
    )
  },
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
