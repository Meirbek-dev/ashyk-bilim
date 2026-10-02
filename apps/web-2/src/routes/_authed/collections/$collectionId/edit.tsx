import { createFileRoute } from '@tanstack/react-router'

import { CollectionEditPage, CollectionNotFound, ensureCollection } from '#/features/collections'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/collections/$collectionId/edit')({
  loader: ({ context, params }) => ensureCollection(context.queryClient, params.collectionId, 'update'),
  staticData: { title: m.collections_edit_title },
  component: CollectionEditPage,
  notFoundComponent: CollectionNotFound,
})
