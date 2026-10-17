import { createFileRoute } from '@tanstack/react-router'

import { LandingPage, landingCoursesOptions, platformOptions } from '#/features/catalog'

export const Route = createFileRoute('/_guest/')({
  loader: async ({ context }) => {
    const [platform] = await Promise.all([
      context.queryClient.query({ ...platformOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...landingCoursesOptions(), staleTime: 'static' }),
    ])
    return platform
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: loaderData.name }, { name: 'description', content: loaderData.description || loaderData.name }]
      : [],
  }),
  component: LandingPage,
})
