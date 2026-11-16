import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { AiPanel, prefetchPanel } from '#/features/ai'
import { aiSearchSchema } from '#/features/ai/route'
import { ensurePlayer, PlayerError, PlayerNotFound, PlayerPage } from '#/features/player'
import { m } from '#/paraglide/messages'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { documentTitle } from '#/shared/lib/document-title'

// The activity player (spec 5.4): an enrolled learner and staff previewing; anyone else, a guest too, reads the
// lessons of a course open without sign-in (`guest_access`). A guest elsewhere signs in first, a signed-in visitor
// gets a 403 in place. The AI panel is its right slot (slice 6.3); its tab and thread live in the search params.
// Where the AI is off for the activity, or in an open view, the column and its phone sheet are left out (B-AI-02).
export const Route = createFileRoute('/_open/learn/$courseId/$activityId')({
  validateSearch: aiSearchSchema,
  // The AI capabilities do not wait for the player's reads (a refused player discards them); a guest has none.
  loader: async ({ context, params, location }) => {
    const guest = !context.session
    const [player, ai] = await Promise.all([
      ensurePlayer(context.queryClient, params.courseId, params.activityId, guest ? location.href : null),
      guest ? undefined : prefetchPanel(context.queryClient, { ...params, surface: 'student-activity' }),
    ])
    return { ...player, aiOff: guest || player.open || ai?.available === false }
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: documentTitle(loaderData.title) }] : [] }),
  staticData: { title: m.platform_page_activity, notFoundTitle: m.player_not_found, layout: 'focus' },
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
                  <Suspense fallback={<ListSkeleton />}>
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
