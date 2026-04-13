'use server';

import { errorHandling } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

/*
 This file includes only POST, PUT, DELETE requests
*/

export async function updatePlatform(data: any) {
  const result = await apiFetch('platform', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
}

export async function uploadPlatformLogo(logo_file: any) {
  const formData = new FormData();
  formData.append('logo_file', logo_file);
  const result = await apiFetch('logo', { method: 'PUT', body: formData });
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
}

export async function uploadPlatformThumbnail(thumbnail_file: any) {
  const formData = new FormData();
  formData.append('thumbnail_file', thumbnail_file);
  const result = await apiFetch('thumbnail', { method: 'PUT', body: formData });
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
}

export const uploadPlatformPreview = async (file: File) => {
  const formData = new FormData();
  formData.append('preview_file', file);
  const result = await apiFetch('preview', { method: 'PUT', body: formData });
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
};
