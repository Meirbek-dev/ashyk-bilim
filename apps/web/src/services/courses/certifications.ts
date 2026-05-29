'use server'

import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client'
import { courseTag, tags } from '@/lib/cacheTags'

interface CertificationInvalidationOptions {
  lastKnownUpdateDate?: string
  courseUuid?: string
}

export interface CreateCertificationParams {
  course_id: number
  config: any
  options?: CertificationInvalidationOptions
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
  })
  const response = await errorHandling<any>(result)

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')

  return response
}

export interface UpdateCertificationParams {
  certification_uuid: string
  config: any
  options?: CertificationInvalidationOptions
}

export async function updateCertification({ certification_uuid, config, options }: UpdateCertificationParams) {
  const result = await apiFetch(`certifications/${certification_uuid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      last_known_update_date: options?.lastKnownUpdateDate ?? undefined,
    }),
  })
  const response = await errorHandling<any>(result)

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')

  return response
}

export async function deleteCertification(certification_uuid: string, options?: CertificationInvalidationOptions) {
  const query = new URLSearchParams()
  if (options?.lastKnownUpdateDate) query.set('last_known_update_date', options.lastKnownUpdateDate)

  const result = await apiFetch(`certifications/${certification_uuid}${query.size > 0 ? `?${query.toString()}` : ''}`, {
    method: 'DELETE',
  })
  const response = await errorHandling<any>(result)

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')

  return response
}

export async function getCertificateByUuid(user_certification_uuid: string) {
  const result = await fetch(
    `${(await import('@services/config/config')).getAPIUrl()}certifications/certificate/${user_certification_uuid}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } },
  )
  return getResponseMetadata(result)
}
