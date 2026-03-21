'use server';

import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests';
import { CacheProfiles, cacheLife, cacheTag } from '@/lib/cache';
import { getServerAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
 Client-side GET requests are called from the frontend using SWR
*/

async function fetchPlatform(access_token?: string) {
  'use cache';
  cacheTag(tags.platform);
  cacheLife(CacheProfiles.platform);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(`${getServerAPIUrl()}platform`, {
    method: 'GET',
    headers,
  });
  return await errorHandling(result);
}

export async function getContextInfo(_next?: unknown, access_token?: string) {
  return fetchPlatform(access_token);
}

export async function getPlatformContextInfo(access_token?: string) {
  return fetchPlatform(access_token);
}

export async function getContextInfoWithoutCredentials(_next?: unknown) {
  return await fetchPlatform();
}

export async function getContextInfoNoAsync(next: unknown, access_token: string) {
  return await fetch(`${getServerAPIUrl()}platform`, RequestBodyWithAuthHeader('GET', null, next, access_token));
}

export async function updateLanding(landing_object: any, access_token: string) {
  const result = await fetch(
    `${getServerAPIUrl()}platform/landing`,
    RequestBodyWithAuthHeader('PUT', landing_object, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate platform cache after landing update
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return metadata;
}

export async function uploadLandingContent(content_file: File, access_token: string) {
  const formData = new FormData();
  formData.append('content_file', content_file);

  const result = await fetch(
    `${getServerAPIUrl()}platform/landing/content`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function removeUser(user_id: number, access_token: string) {
  const result = await fetch(
    `${getServerAPIUrl()}platform/users/${user_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate cache after user removal
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}
