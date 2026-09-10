'use server'

import { apiJson, apiResult } from '@/lib/api-client'
import type { Certification, VerifiedCertificate } from '@/lib/api/generated/zod'
import { courseTag, tags } from '@/lib/cacheTags'

interface CertificationInvalidationOptions {
  courseUuid?: string
}

async function revalidateCertificationTags(options?: CertificationInvalidationOptions) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  if (options?.courseUuid) revalidateTag(courseTag.certifications(options.courseUuid), 'max')
}

export interface CreateCertificationParams {
  course_id: string
  config: AppPayload
  options?: CertificationInvalidationOptions
}

export async function createCertification({ course_id, config, options }: CreateCertificationParams) {
  const response = await apiJson<Certification>('certifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_id, config }),
  })
  await revalidateCertificationTags(options)
  return response
}

export interface UpdateCertificationParams {
  certification_id: string
  config: AppPayload
  options?: CertificationInvalidationOptions
}

export async function updateCertification({ certification_id, config, options }: UpdateCertificationParams) {
  const response = await apiJson<Certification>(`certifications/${certification_id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
  await revalidateCertificationTags(options)
  return response
}

export async function deleteCertification(certification_id: string, options?: CertificationInvalidationOptions) {
  const response = await apiJson<void>(`certifications/${certification_id}`, { method: 'DELETE' })
  await revalidateCertificationTags(options)
  return response
}

/** Public verification view by the certificate's `verify_code` (`GET /certificates/{code}`). */
export async function getCertificateByCode(code: string) {
  return apiResult<VerifiedCertificate>(`certificates/${code}`)
}
