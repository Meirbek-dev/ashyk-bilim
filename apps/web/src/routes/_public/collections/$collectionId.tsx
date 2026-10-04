import { createFileRoute } from '@tanstack/react-router'

import { CollectionNotFound, CollectionPage, ensureCollection } from '#/features/collections'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/collections/$collectionId')({
  loader: ({ context, params }) => ensureCollection(context.queryClient, params.collectionId),
  staticData: { title: m.platform_page_collection },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.name }] : [] }),
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
})
