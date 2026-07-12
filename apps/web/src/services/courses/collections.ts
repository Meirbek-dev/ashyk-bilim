'use server'

import { apiJson } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'

import { getAPIUrl } from '../config/config'

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
*/

export async function deleteCollection(collection_uuid: string): Promise<AppPayload> {
  const data = await apiJson<AppPayload>(`collections/${collection_uuid}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.collections, 'max')

  return data
}

export async function createCollection(collection: AppCollection): Promise<AppCollection> {
  const data = await apiJson<AppCollection>('collections/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collection),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.collections, 'max')

  return data
}

async function fetchCollectionById(collection_uuid: string): Promise<AppCollection> {
  return apiJson<AppCollection>(`collections/collection_${collection_uuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
}

export async function getCollectionById(collection_uuid: string, _next?: unknown) {
  return fetchCollectionById(collection_uuid)
}

/**
 * Cached fetch for collections
 */
async function fetchCollections(): Promise<AppCollection[]> {
  return apiJson<AppCollection[]>('collections/page/1/limit/20', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
}

export async function getCollections(_next?: unknown) {
  return fetchCollections()
}
