import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { ListPage } from '#/shared/ui/templates/list-page'

import { CollectionsFound } from './collections-found'
import { CollectionsList } from './collections-list'
import { CollectionsSearch } from './collections-search'
import { CreateCollectionDialog } from './create-collection-dialog'

/** Public collections (plus the caller's own), searchable by name; "New collection" only with `collection.create`. */
export function CollectionsPage() {
  const { q } = useSearch({ from: '/_public/collections/' })
  const { data: session } = useSuspenseQuery(sessionOptions())
  const create = hasCapability(session, 'collection.create') ? <CreateCollectionDialog /> : null
  return (
    <ListPage
      title={m.collections_title()}
      primaryAction={create}
      // Keyed by the URL value: "back" to another search refills the box.
      search={<CollectionsSearch key={q ?? ''} q={q} />}
    >
      {q ? <CollectionsFound q={q} /> : <CollectionsList />}
    </ListPage>
  )
}
