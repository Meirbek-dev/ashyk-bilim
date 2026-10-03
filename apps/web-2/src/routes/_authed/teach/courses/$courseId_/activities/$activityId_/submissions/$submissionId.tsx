import { createFileRoute } from '@tanstack/react-router'

import { SubmissionAiPanel } from '#/features/ai'
import { ensureReview, ReviewPage, SubmissionNotFound } from '#/features/grading'
import { queueSearchSchema } from '#/features/grading/route'
import { m } from '#/paraglide/messages'

// One work under review (spec 5.4 «Проверка»); the search is the queue's, so prev / next walk the same filter. The AI
// submission analysis (slice 6.3) is its right panel.
export const Route = createFileRoute(
  '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId',
)({
  validateSearch: queueSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    ensureReview(context.queryClient, params.activityId, params.submissionId, deps),
  staticData: { title: m.platform_page_submission, layout: 'focus' },
  component: Review,
  notFoundComponent: SubmissionNotFound,
})

function Review() {
  return <ReviewPage aside={{ label: m.ai_panel_title(), Panel: SubmissionAiPanel }} />
}
