import { createFileRoute } from '@tanstack/react-router'

import { AttemptPage, ensureAttempt } from '#/features/attempt'
import { attemptSearchSchema } from '#/features/attempt/route'
import { PlayerError, PlayerNotFound } from '#/features/player'
import { m } from '#/paraglide/messages'

// A quiz or exam attempt (spec 5.4, R-08): the entry, an open draft or a handed-in result, picked by `?attempt`.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId_/attempt')({
  validateSearch: attemptSearchSchema,
  loaderDeps: ({ search }) => ({ attempt: search.attempt }),
  loader: ({ context, params, deps }) => ensureAttempt(context.queryClient, { ...params, attemptId: deps.attempt }),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.title }] : [] }),
  staticData: { title: m.player_page_attempt, layout: 'focus' },
  component: AttemptPage,
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
