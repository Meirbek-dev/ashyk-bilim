import { createFileRoute } from '@tanstack/react-router'

import { ensureLearning, LearningPage } from '#/features/learning'
import { learningSearchSchema } from '#/features/learning/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/learning')({
  validateSearch: learningSearchSchema,
  loader: ({ context }) => ensureLearning(context.queryClient),
  staticData: { title: m.platform_nav_learning },
  component: LearningPage,
})
