import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { ListState } from '#/shared/components/list-state'

import { type SearchKind, searchKinds } from '../model/catalog'
import { searchResultsOptions } from '../queries'
import { SearchKinds } from './search-kinds'
import { SearchSection } from './search-section'

/** One `search` answer: the section links with counts, then the chosen section (or every non-empty one). */
export function SearchResults({ q, kind }: { q: string; kind: SearchKind | undefined }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const query = useSuspenseQuery(searchResultsOptions(q))
  const navigate = useNavigate()
  const kinds = searchKinds(session !== null)
  const shown = kinds.filter(each => (kind ? each === kind : query.data[each].length > 0))
  const count = shown.reduce((sum, each) => sum + query.data[each].length, 0)
  return (
    <>
      <SearchKinds q={q} kinds={kinds} results={query.data} />
      <ListState
        pending={false}
        error={query.error}
        count={count}
        filtered
        emptyText={m.catalog_palette_empty()}
        onResetFilters={() => void navigate({ to: '/search', search: {} })}
        onRetry={() => void query.refetch()}
      >
        {shown.map(each => (
          <SearchSection key={each} kind={each} results={query.data} />
        ))}
      </ListState>
    </>
  )
}
