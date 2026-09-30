// Plain isomorphic functions, NOT server actions: problem+json codes and
// field errors must reach the client `useApiError` (GAUNTLET BUG-035, UX-242).
// Nothing reads these cache tags (no `cacheTag()` consumer), so nothing is revalidated.
import { apiJson, apiResult } from '@/lib/api-client'
import type { Certification, VerifiedCertificate } from '@/lib/api/generated/zod'

export interface CreateCertificationParams {
  course_id: string
  config: AppPayload
}

export async function createCertification({ course_id, config }: CreateCertificationParams) {
  return apiJson<Certification>('certifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_id, config }),
  })
}

export interface UpdateCertificationParams {
  certification_id: string
  config: AppPayload
}

export async function updateCertification({ certification_id, config }: UpdateCertificationParams) {
  return apiJson<Certification>(`certifications/${certification_id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
}

export async function deleteCertification(certification_id: string) {
  return apiJson<void>(`certifications/${certification_id}`, { method: 'DELETE' })
}

/** Public verification view by the certificate's `verify_code` (`GET /certificates/{code}`). */
export async function getCertificateByCode(code: string) {
  return apiResult<VerifiedCertificate>(`certificates/${code}`)
}
