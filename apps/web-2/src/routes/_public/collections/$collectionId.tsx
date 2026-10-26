import { createFileRoute } from '@tanstack/react-router'

import { CollectionNotFound, CollectionPage, ensureCollection } from '#/features/collections'
import { markdownSummary } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { pageMeta } from '#/shared/lib/document-title'

export const Route = createFileRoute('/_public/collections/$collectionId')({
  loader: async ({ context, params }) => {
    const collection = await ensureCollection(context.queryClient, params.collectionId)
    return { name: collection.name, summary: markdownSummary(collection.description), image: collection.cover_key }
  },
  staticData: { title: m.platform_page_collection, notFoundTitle: m.collections_not_found },
  // A collection is shared as a link: its name, description and cover make the preview (like a course's).
  head: ({ loaderData }) => ({
    meta: loaderData ? pageMeta(loaderData.name, loaderData.summary, { imageKey: loaderData.image }) : [],
  }),
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
})
