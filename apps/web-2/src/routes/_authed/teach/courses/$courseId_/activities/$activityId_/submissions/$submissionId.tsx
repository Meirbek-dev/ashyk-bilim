import { createFileRoute } from '@tanstack/react-router'

import { ensureReview, queueSearchSchema, ReviewPage, SubmissionNotFound } from '#/features/grading'
import { m } from '#/paraglide/messages'

// One work under review (spec 5.4 «Проверка»); the search is the queue's, so prev / next walk the same filter.
export const Route = createFileRoute(
  '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId',
)({
  validateSearch: queueSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    ensureReview(context.queryClient, params.activityId, params.submissionId, deps),
  staticData: { title: m.platform_page_submission, layout: 'focus' },
  component: ReviewPage,
  notFoundComponent: SubmissionNotFound,
})
