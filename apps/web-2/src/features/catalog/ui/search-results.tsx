import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { mergeSearchPages, SEARCH_LIMIT, type SearchKind, searchCount, searchKinds } from '../model/catalog'
import { searchPagesOptions } from '../queries'
import { searchKindLabels } from './kind-labels'
import { SearchKinds } from './search-kinds'
import { SearchSection } from './search-section'

/**
 * The search answer: the section links with counts, then the chosen section (or every non-empty one). Nothing found
 * names the query and leads to the catalog; an empty section ("People") goes back to all sections, query kept (B-CAT-09).
 * A section with more hits than one page: «Показать ещё» under the chosen section, a link to it under "all" (B-CAT-07).
 */
export function SearchResults({ q, kind }: { q: string; kind: SearchKind | undefined }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const query = useSuspenseInfiniteQuery(searchPagesOptions(q))
  const navigate = useNavigate()
  const { results, more } = mergeSearchPages(query.data.pages, SEARCH_LIMIT)
  const kinds = searchKinds(session !== null)
  const shown = kinds.filter(each => (kind ? each === kind : searchCount(results, each) > 0))
  const count = shown.reduce((sum, each) => sum + searchCount(results, each), 0)
  return (
    <>
      <SearchKinds q={q} kinds={kinds} results={results} more={more} />
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
          <SearchSection
            key={each}
            kind={each}
            results={results}
            footer={
              !more.includes(each) ? null : kind ? (
                <ShowMore hasMore pending={query.isFetchingNextPage} onMore={() => void query.fetchNextPage()} />
              ) : (
                <RouterLink
                  to="/search"
                  search={{ q, kind: each }}
                  className={buttonVariants({ variant: 'outline', className: 'self-center' })}
                >
                  {m.catalog_search_section_all({ section: searchKindLabels[each]() })}
                </RouterLink>
              )
            }
          />
        ))}
      </ListState>
    </>
  )
}
