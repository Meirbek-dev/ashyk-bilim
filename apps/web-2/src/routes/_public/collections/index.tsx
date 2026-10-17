import { createFileRoute } from '@tanstack/react-router'

import { CollectionsPage, collectionsListOptions, collectionsSearchOptions } from '#/features/collections'
import { collectionsSearchSchema } from '#/features/collections/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/collections/')({
  validateSearch: collectionsSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) =>
    deps.q
      ? context.queryClient.query({ ...collectionsSearchOptions(deps.q), staleTime: 'static' })
      : context.queryClient.infiniteQuery({ ...collectionsListOptions(), staleTime: 'static' }),
  staticData: { title: m.collections_title },
  component: CollectionsPage,
})
