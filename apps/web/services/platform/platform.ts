'use server';

import { errorHandling, getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import type { CustomResponseTyping } from '@/lib/api-client';
import { getServerAPIUrl } from '@services/config/config';
import type { components } from '@/lib/api/generated';
import { tags } from '@/lib/cacheTags';

type PlatformRead = components['schemas']['PlatformRead'];
type PlatformDetailResponse = components['schemas']['PlatformDetailResponse'];
type PlatformLandingUploadResponse = components['schemas']['PlatformLandingUploadResponse'];

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null;
};

async function getTypedResponseMetadata<T>(response: Response): Promise<ResponseMetadata<T>> {
  return await getResponseMetadata(response);
}

async function fetchPlatform(): Promise<PlatformRead | null> {
  try {
    const result = await apiFetch('platform', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      baseUrl: getServerAPIUrl(),
      signal: AbortSignal.timeout(8000),
    });
    return await errorHandling(result);
  } catch {
    return null;
  }
}

export async function getPlatform() {
  return fetchPlatform();
}

export async function updateLanding(
  landing_object: Record<string, unknown>,
): Promise<ResponseMetadata<PlatformDetailResponse>> {
  const result = await apiFetch('landing', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(landing_object),
  });
  const metadata = await getTypedResponseMetadata<PlatformDetailResponse>(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return metadata;
}

export async function uploadLandingContent(
  content_file: File,
): Promise<ResponseMetadata<PlatformLandingUploadResponse>> {
  const formData = new FormData();
  formData.append('content_file', content_file);

  const result = await apiFetch('landing/content', { method: 'POST', body: formData });
  return await getTypedResponseMetadata<PlatformLandingUploadResponse>(result);
}

export async function removeUser(user_id: number): Promise<ResponseMetadata<PlatformDetailResponse>> {
  const result = await apiFetch(`members/${user_id}`, { method: 'DELETE' });
  const metadata = await getTypedResponseMetadata<PlatformDetailResponse>(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}
