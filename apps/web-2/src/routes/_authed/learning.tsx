import { createFileRoute } from '@tanstack/react-router'

import { ensureLearning, LearningPage, learningSearchSchema } from '#/features/learning'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/learning')({
  validateSearch: learningSearchSchema,
  loader: ({ context }) => ensureLearning(context.queryClient),
  staticData: { title: m.platform_nav_learning },
  component: LearningPage,
})
