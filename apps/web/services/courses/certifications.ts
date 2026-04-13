'use server';

import { errorHandling, getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';

export async function getCourseCertifications(course_uuid: string, next?: any) {
  const result = await apiFetch(`certifications/course/${course_uuid}`, next ? { next } : {});
  return await getResponseMetadata(result);
}

interface CertificationInvalidationOptions {
  courseUuid?: string;
  includeEditableList?: boolean;
  lastKnownUpdateDate?: string | null;
}

export interface CreateCertificationParams {
  course_id: number;
  config: any;
  options?: CertificationInvalidationOptions;
}

export async function createCertification({ course_id, config, options }: CreateCertificationParams) {
  const result = await apiFetch('certifications/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course_id,
      config,
      last_known_update_date: options?.lastKnownUpdateDate ?? undefined,
    }),
  });
  return errorHandling(result);
}

export interface UpdateCertificationParams {
  certification_uuid: string;
  config: any;
  options?: CertificationInvalidationOptions;
}

export async function updateCertification({ certification_uuid, config, options }: UpdateCertificationParams) {
  const result = await apiFetch(`certifications/${certification_uuid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, last_known_update_date: options?.lastKnownUpdateDate ?? undefined }),
  });
  return errorHandling(result);
}

export async function deleteCertification(certification_uuid: string, options?: CertificationInvalidationOptions) {
  const query = new URLSearchParams();
  if (options?.lastKnownUpdateDate) query.set('last_known_update_date', options.lastKnownUpdateDate);

  const result = await apiFetch(`certifications/${certification_uuid}${query.size > 0 ? `?${query.toString()}` : ''}`, {
    method: 'DELETE',
  });
  return errorHandling(result);
}

export async function getUserCertificates(course_uuid: string) {
  const result = await apiFetch(`certifications/user/course/${course_uuid}`);
  return getResponseMetadata(result);
}

export async function getCertificateByUuid(user_certification_uuid: string) {
  const result = await fetch(
    `${(await import('@services/config/config')).getAPIUrl()}certifications/certificate/${user_certification_uuid}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } },
  );
  return getResponseMetadata(result);
}

export async function getAllUserCertificates() {
  const result = await apiFetch('certifications/user/all');
  return getResponseMetadata(result);
}
