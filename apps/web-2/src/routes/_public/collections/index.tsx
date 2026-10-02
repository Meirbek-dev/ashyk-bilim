import { createFileRoute } from '@tanstack/react-router'

import { CollectionsPage, collectionsListOptions } from '#/features/collections'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/collections/')({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(collectionsListOptions()),
  head: () => ({ meta: [{ title: m.collections_title() }] }),
  component: CollectionsPage,
})
