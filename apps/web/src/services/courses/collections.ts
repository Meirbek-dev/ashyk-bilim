'use server'

import { apiJson } from '@/lib/api-client'
import { Collection, CollectionPage } from '@/lib/api/generated/zod'
import { stripEntityPrefix, toAppCollection } from '@/hooks/courses/courseKeys'

import { getAPIUrl } from '../config/config'

/*
 This file includes POST requests and cached GET requests (the card deletes
 through the generated client fetcher, BUG-035).
*/

const serverGet = () => ({ method: 'GET', baseUrl: getAPIUrl(), timeoutMs: 10_000 })

export async function getCollectionById(collection_uuid: string, _next?: unknown): Promise<AppCollection> {
  const data = await apiJson(`collections/${stripEntityPrefix(collection_uuid)}`, serverGet(), value =>
    Collection.parse(value),
  )
  return toAppCollection(data)
}

/** First keyset page of collections (`GET collections?limit=`). */
export async function getCollections(_next?: unknown, limit = 20): Promise<AppCollection[]> {
  const page = await apiJson(`collections?limit=${limit}`, serverGet(), value => CollectionPage.parse(value))
  return page.items.map(toAppCollection)
}
