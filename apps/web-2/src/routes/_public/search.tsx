import { createFileRoute } from '@tanstack/react-router'

import { SearchPage, searchPageSchema, searchResultsOptions } from '#/features/catalog'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/search')({
  validateSearch: searchPageSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) => (deps.q ? context.queryClient.ensureQueryData(searchResultsOptions(deps.q)) : null),
  staticData: { title: m.platform_page_search },
  component: SearchPage,
})
