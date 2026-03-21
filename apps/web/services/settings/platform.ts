'use server';

import { RequestBodyFormWithAuthHeader, RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests';
import { getServerAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

/*
 This file includes only POST, PUT, DELETE requests
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export async function updatePlatform(data: any, access_token: string) {
  const result: any = await fetch(
    `${getServerAPIUrl()}platform`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
}

export async function uploadPlatformLogo(logo_file: any, access_token: string) {
  // Send file thumbnail as form data
  const formData = new FormData();
  formData.append('logo_file', logo_file);
  const result: any = await fetch(
    `${getServerAPIUrl()}platform/logo`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, access_token),
  );
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
}

export async function uploadPlatformThumbnail(thumbnail_file: any, access_token: string) {
  // Send file thumbnail as form data
  const formData = new FormData();
  formData.append('thumbnail_file', thumbnail_file);
  const result: any = await fetch(
    `${getServerAPIUrl()}platform/thumbnail`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, access_token),
  );
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
}

export const uploadPlatformPreview = async (file: File, access_token: string) => {
  const formData = new FormData();
  formData.append('preview_file', file);

  const result: any = await fetch(
    `${getServerAPIUrl()}platform/preview`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, access_token),
  );
  const response = await errorHandling(result);
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.platform, 'max');
  return response;
};
