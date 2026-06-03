'use server'

import { apiFetch, errorHandling } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'

import { getAPIUrl } from '../config/config'

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
*/

export async function deleteCollection(collection_uuid: string): Promise<AppPayload> {
  const result = await apiFetch(`collections/${collection_uuid}`, {
    method: 'DELETE',
  })
  const data_result = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.collections, 'max')
  }

  return data_result
}

export async function createCollection(collection: AppCollection): Promise<AppCollection> {
  const result = await apiFetch('collections/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collection),
  })
  const data_result = await errorHandling<AppCollection>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.collections, 'max')
  }

  return data_result
}

async function fetchCollectionById(collection_uuid: string): Promise<AppCollection> {
  const result = await apiFetch(`collections/collection_${collection_uuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
  return await errorHandling<AppCollection>(result)
}

export async function getCollectionById(collection_uuid: string, _next?: unknown) {
  return fetchCollectionById(collection_uuid)
}

/**
 * Cached fetch for collections
 */
async function fetchCollections(): Promise<AppCollection[]> {
  const result = await apiFetch('collections/page/1/limit/20', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
  return await errorHandling<AppCollection[]>(result)
}

export async function getCollections(_next?: unknown) {
  return fetchCollections()
}
