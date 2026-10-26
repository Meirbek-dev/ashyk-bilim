import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { ListState } from '#/shared/components/list-state'

import { type SearchKind, searchCount, searchKinds } from '../model/catalog'
import { searchResultsOptions } from '../queries'
import { SearchKinds } from './search-kinds'
import { SearchSection } from './search-section'

/**
 * One `search` answer: the section links with counts, then the chosen section (or every non-empty one). Nothing found
 * names the query and leads to the catalog; an empty section ("People") goes back to all sections, query kept (B-CAT-09).
 */
export function SearchResults({ q, kind }: { q: string; kind: SearchKind | undefined }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const query = useSuspenseQuery(searchResultsOptions(q))
  const navigate = useNavigate()
  const kinds = searchKinds(session !== null)
  const shown = kinds.filter(each => (kind ? each === kind : searchCount(query.data, each) > 0))
  const count = shown.reduce((sum, each) => sum + searchCount(query.data, each), 0)
  return (
    <>
      <SearchKinds q={q} kinds={kinds} results={query.data} />
      <ListState
        pending={false}
        error={query.error}
        count={count}
        filtered={kind !== undefined}
        emptyText={m.catalog_search_none({ q })}
        emptyAction={
          <RouterLink to="/courses" className={buttonVariants({ variant: 'outline' })}>
            {m.catalog_landing_all_courses()}
          </RouterLink>
        }
        onResetFilters={() => void navigate({ to: '/search', search: { q } })}
        onRetry={() => void query.refetch()}
      >
        {shown.map(each => (
          <SearchSection key={each} kind={each} results={query.data} />
        ))}
      </ListState>
    </>
  )
}
