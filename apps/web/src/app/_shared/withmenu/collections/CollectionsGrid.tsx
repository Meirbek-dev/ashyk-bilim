'use client'

import { useQuery } from '@tanstack/react-query'
import CollectionThumbnail from '@components/Objects/Thumbnails/CollectionThumbnail'
import { toAppCollection } from '@/hooks/courses/courseKeys'
import { listCollections } from '@/lib/api/generated/collections/collections'
import { queryKeys } from '@/lib/react-query/queryKeys'

interface CollectionsGridProps {
  initialCollections: AppCollection[]
  /** Rendered instead of the cards when the list is empty. */
  empty: React.ReactNode
}

/**
 * The collections list, seeded from the server render and refetched on
 * window focus (UX-109): a collection created in another tab shows up
 * without a reload. The app-wide default is `refetchOnWindowFocus: false`.
 */
export default function CollectionsGrid({ initialCollections, empty }: CollectionsGridProps) {
  const { data: collections } = useQuery({
    queryKey: queryKeys.collections.list(),
    queryFn: async () => (await listCollections({ limit: 20 })).items.map(toAppCollection),
    initialData: initialCollections,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  })

  if (collections.length === 0) return empty
  return (
    <>
      {collections.map(collection => (
        <CollectionThumbnail key={collection.collection_uuid} collection={collection} />
      ))}
    </>
  )
}
