import { createFileRoute } from '@tanstack/react-router'

import { LandingPage, landingCoursesOptions, platformOptions } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import { pageMeta } from '#/shared/lib/document-title'

// The line search results and link previews show: the platform's description unless it only repeats the name,
// then its "about", then the generic lead.
const landingDescription = ({ name, description, about }: { name: string; description: string; about: string }) =>
  [description, about].map(text => text.trim()).find(text => text && text !== name) ?? m.catalog_landing_lead()

export const Route = createFileRoute('/_guest/')({
  loader: async ({ context }) => {
    const [platform] = await Promise.all([
      context.queryClient.query({ ...platformOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...landingCoursesOptions(), staleTime: 'static' }),
    ])
    return platform
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? pageMeta(loaderData.name, landingDescription(loaderData), loaderData.name) : [],
  }),
  component: LandingPage,
})
