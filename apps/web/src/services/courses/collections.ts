'use server'

import { apiJson } from '@/lib/api-client'
import { Collection, CollectionPage } from '@/lib/api/generated/zod'
import { stripEntityPrefix, toAppCollection } from '@/hooks/courses/courseKeys'
import { tags } from '@/lib/cacheTags'

import { getAPIUrl } from '../config/config'

/*
 This file includes POST requests and cached GET requests (the card deletes
 through the generated client fetcher, BUG-035).
*/

const serverGet = () => ({ method: 'GET', baseUrl: getAPIUrl(), timeoutMs: 10_000 })

/** `courses` are v2 course ids (`CreateCollectionRequest`). */
export async function createCollection(collection: {
  name: string
  description?: string | null
  public?: boolean | null
  courses?: (string | number)[] | null
}): Promise<AppCollection> {
  const data = await apiJson(
    'collections',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: collection.name,
        description: collection.description ?? null,
        public: collection.public ?? null,
        courses: collection.courses?.map(id => stripEntityPrefix(String(id))) ?? null,
      }),
    },
    Collection.parse,
  )

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.collections, 'max')

  return toAppCollection(data)
}

export async function getCollectionById(collection_uuid: string, _next?: unknown): Promise<AppCollection> {
  const data = await apiJson(`collections/${stripEntityPrefix(collection_uuid)}`, serverGet(), Collection.parse)
  return toAppCollection(data)
}

/** First keyset page of collections (`GET collections?limit=`). */
export async function getCollections(_next?: unknown, limit = 20): Promise<AppCollection[]> {
  const page = await apiJson(`collections?limit=${limit}`, serverGet(), CollectionPage.parse)
  return page.items.map(toAppCollection)
}
