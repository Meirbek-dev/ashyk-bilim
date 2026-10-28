import { createFileRoute } from '@tanstack/react-router'

import { ensureSubmission, SubmissionPage } from '#/features/file-submissions'
import { PlayerError, PlayerNotFound } from '#/features/player'
import { m } from '#/paraglide/messages'
import { documentTitle } from '#/shared/lib/document-title'

// Handing in files (spec 5.4): the player's entry card links here; an enrolled learner only, 403 in place otherwise.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId_/submission')({
  loader: ({ context, params }) => ensureSubmission(context.queryClient, params.courseId, params.activityId),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: documentTitle(loaderData.title) }] : [] }),
  staticData: { title: m.player_page_submission, notFoundTitle: m.player_not_found, layout: 'focus' },
  component: SubmissionPage,
  errorComponent: PlayerError,
  notFoundComponent: PlayerNotFound,
})
