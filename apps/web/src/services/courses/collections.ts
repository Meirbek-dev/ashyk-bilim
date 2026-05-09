'use server';

import { errorHandling } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

import { getAPIUrl } from '../config/config';

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
*/

export async function deleteCollection(collection_uuid: string) {
  const result = await apiFetch(`collections/${collection_uuid}`, { method: 'DELETE' });
  const data_result = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.collections, 'max');
  }

  return data_result;
}

export async function createCollection(collection: any) {
  const result = await apiFetch('collections/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(collection),
  });
  const data_result = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.collections, 'max');
  }

  return data_result;
}

async function fetchCollectionById(collection_uuid: string) {
  const result = await apiFetch(`collections/collection_${collection_uuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    signal: AbortSignal.timeout(10_000),
  });
  return await errorHandling(result);
}

export async function getCollectionById(collection_uuid: string, _next?: any) {
  return fetchCollectionById(collection_uuid);
}

/**
 * Cached fetch for collections
 */
async function fetchCollections() {
  const result = await apiFetch('collections/page/1/limit/20', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    signal: AbortSignal.timeout(10_000),
  });
  return await errorHandling(result);
}

export async function getCollections(_next?: any) {
  return fetchCollections();
}
