import { createFileRoute } from '@tanstack/react-router'

import { AiGradingPage, ensureAiGrading } from '#/features/ai-grading'
import { aiGradingSearchSchema } from '#/features/ai-grading/route'
import { m } from '#/paraglide/messages'

// The course's AI pre-grading (docs/AI-FIRST.md 5): auto-drafts, metrics per period, activities, material index.
export const Route = createFileRoute('/_authed/teach/courses/$courseId/ai-grading')({
  validateSearch: aiGradingSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) => ensureAiGrading(context.queryClient, params.courseId, deps),
  staticData: { title: m.platform_tab_ai_grading },
  component: AiGradingPage,
})
