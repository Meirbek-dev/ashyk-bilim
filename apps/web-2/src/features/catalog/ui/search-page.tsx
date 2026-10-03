import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ListPage } from '#/shared/components/templates/list-page'

import { SearchBox } from './search-box'
import { SearchResults } from './search-results'

/** Platform search: the query and the section are in the URL (`?q=&kind=`); without a query, an invitation. */
export function SearchPage() {
  const { q, kind } = useSearch({ from: '/_public/search' })
  const navigate = useNavigate({ from: '/search' })
  return (
    <ListPage
      title={m.catalog_search_title()}
      search={
        <SearchBox
          key={q ?? ''}
          q={q}
          label={m.catalog_search_label()}
          onSearch={text => navigate({ search: prev => ({ ...prev, q: text }) })}
        />
      }
    >
      {q ? <SearchResults q={q} kind={kind} /> : <p className="text-muted-foreground">{m.catalog_search_prompt()}</p>}
    </ListPage>
  )
}
