import { createFileRoute } from '@tanstack/react-router'

import { UpdatesPage, updatesOptions } from '#/features/course'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/courses/$courseId/updates')({
  loader: ({ context, params }) => context.queryClient.ensureInfiniteQueryData(updatesOptions(params.courseId)),
  staticData: { title: m.platform_tab_updates },
  component: UpdatesPage,
})
