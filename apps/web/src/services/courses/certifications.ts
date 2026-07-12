'use server'

import { apiJson, apiResult } from '@/lib/api-client'
import { courseTag, tags } from '@/lib/cacheTags'

interface CertificationInvalidationOptions {
  lastKnownUpdateDate?: string | undefined
  courseUuid?: string
}

export interface CreateCertificationParams {
  course_id: number
  config: AppPayload
  options?: CertificationInvalidationOptions
}

export async function createCertification({ course_id, config, options }: CreateCertificationParams) {
  const response = await apiJson<AppCertification>('certifications/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course_id,
      config,
      last_known_update_date: options?.lastKnownUpdateDate ?? undefined,
    }),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')

  return response
}

export interface UpdateCertificationParams {
  certification_uuid: string
  config: AppPayload
  options?: CertificationInvalidationOptions
}

export async function updateCertification({ certification_uuid, config, options }: UpdateCertificationParams) {
  const response = await apiJson<AppCertification>(`certifications/${certification_uuid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      last_known_update_date: options?.lastKnownUpdateDate ?? undefined,
    }),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')

  return response
}

export async function deleteCertification(certification_uuid: string, options?: CertificationInvalidationOptions) {
  const query = new URLSearchParams()
  if (options?.lastKnownUpdateDate) query.set('last_known_update_date', options.lastKnownUpdateDate)

  const response = await apiJson<AppPayload>(
    `certifications/${certification_uuid}${query.size > 0 ? `?${query.toString()}` : ''}`,
    {
      method: 'DELETE',
    },
  )

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')

  return response
}

export async function getCertificateByUuid(user_certification_uuid: string) {
  return apiResult<AppCertification>(`certifications/certificate/${user_certification_uuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}
