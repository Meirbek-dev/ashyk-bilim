import { createFileRoute } from '@tanstack/react-router'

import { ConsistencyPage, ensureConsistency } from '#/features/ai-grading'
import { m } from '#/paraglide/messages'

// An activity's grading consistency (docs/AI-FIRST.md 4.5): not a tab; the submissions queue links here.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/consistency')({
  loader: ({ context, params }) => ensureConsistency(context.queryClient, params.activityId),
  staticData: { title: m.ai_grading_consistency_title },
  component: ConsistencyPage,
})
