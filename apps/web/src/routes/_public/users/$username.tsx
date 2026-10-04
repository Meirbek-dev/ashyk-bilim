import { createFileRoute } from '@tanstack/react-router'

import { PublicProfilePage, UserNotFound, ensurePublicProfile } from '#/features/settings'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/users/$username')({
  loader: ({ context, params }) => ensurePublicProfile(context.queryClient, params.username),
  staticData: { title: m.platform_page_user },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.display_name }] : [] }),
  component: PublicProfilePage,
  notFoundComponent: UserNotFound,
})
