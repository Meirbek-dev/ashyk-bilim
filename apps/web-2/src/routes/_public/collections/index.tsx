import { createFileRoute } from '@tanstack/react-router'

import {
  CollectionsPage,
  collectionsListOptions,
  collectionsSearchOptions,
  collectionsSearchSchema,
} from '#/features/collections'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/collections/')({
  validateSearch: collectionsSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) =>
    deps.q
      ? context.queryClient.ensureQueryData(collectionsSearchOptions(deps.q))
      : context.queryClient.ensureInfiniteQueryData(collectionsListOptions()),
  head: () => ({ meta: [{ title: m.collections_title() }] }),
  component: CollectionsPage,
})
