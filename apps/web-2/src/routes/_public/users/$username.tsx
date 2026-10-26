import { createFileRoute } from '@tanstack/react-router'

import { PublicProfilePage, UserNotFound, ensurePublicProfile } from '#/features/settings'
import { markdownSummary } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { pageMeta } from '#/shared/lib/document-title'

export const Route = createFileRoute('/_public/users/$username')({
  loader: async ({ context, params }) => {
    const profile = await ensurePublicProfile(context.queryClient, params.username)
    return { name: profile.display_name || profile.username, summary: markdownSummary(profile.bio) }
  },
  staticData: { title: m.platform_page_user, notFoundTitle: m.settings_user_not_found },
  // A profile link previews with the person's name and bio (the brand card as the picture: an avatar is too small).
  head: ({ loaderData }) => ({
    meta: loaderData ? pageMeta(loaderData.name, loaderData.summary) : [],
  }),
  component: PublicProfilePage,
  notFoundComponent: UserNotFound,
})
