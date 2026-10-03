import { createFileRoute } from '@tanstack/react-router'

import { arenaSearchSchema, CodeArenaPage, ensureArena } from '#/features/code-arena'
import { PlayerError, PlayerNotFound } from '#/features/player'
import { m } from '#/paraglide/messages'

// A code challenge (spec 5.3): the player's entry card links here; an enrolled learner only, 403 in place otherwise.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId_/code')({
  validateSearch: arenaSearchSchema,
  loaderDeps: ({ search }) => ({ run: search.run }),
  loader: ({ context, params, deps }) =>
    ensureArena(context.queryClient, { courseId: params.courseId, activityId: params.activityId, run: deps.run }),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.title }] : [] }),
  staticData: { title: m.player_page_code, layout: 'focus' },
  component: CodeArenaPage,
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
