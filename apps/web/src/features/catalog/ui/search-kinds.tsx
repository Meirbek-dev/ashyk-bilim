import { m } from '#/paraglide/messages'
import type { SearchResults } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import type { SearchKind } from '../model/catalog'
import { searchKindLabels } from './kind-labels'

type SearchKindsProps = { q: string; kinds: readonly SearchKind[]; results: SearchResults }

/** The result sections as links (`?kind=`), each with its hit count: a filter in the URL, not tabs in state. */
export function SearchKinds({ q, kinds, results }: SearchKindsProps) {
  return (
    <nav aria-label={m.catalog_search_kinds_label()} className="flex overflow-x-auto border-b">
      <Link to="/search" search={{ q }} variant="tab" activeOptions={{ exact: true }}>
        {m.catalog_search_kind_all()}
      </Link>
      {kinds.map(kind => (
        <Link key={kind} to="/search" search={{ q, kind }} variant="tab" activeOptions={{ exact: true }}>
          {searchKindLabels[kind]()}
          <span className="ml-2 text-muted-foreground tabular-nums">{String(results[kind].length)}</span>
        </Link>
      ))}
    </nav>
  )
}
