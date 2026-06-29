'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { CustomResponseTyping } from '@/lib/api-client'
import {
  certificateDetailQueryOptions,
  userCertificatesQueryOptions,
  userCourseCertificatesQueryOptions,
} from '@/features/courses/queries/course.query'

function userCourseCertificateHookOptions(courseUuid: string | null | undefined) {
  const normalizedCourseUuid = courseUuid ?? 'disabled'

  return queryOptions({
    ...userCourseCertificatesQueryOptions(normalizedCourseUuid),
    enabled: Boolean(courseUuid),
  })
}

function certificateDetailHookOptions(certificateUuid: string | null | undefined) {
  const normalizedCertificateUuid = certificateUuid ?? 'disabled'

  return queryOptions({
    ...certificateDetailQueryOptions(normalizedCertificateUuid),
    enabled: Boolean(certificateUuid),
  })
}

export function useUserCertificates(): UseQueryResult<AppCertification[]> {
  return useQuery(userCertificatesQueryOptions())
}

export function useUserCertificateByCourse(
  courseUuid: string | null | undefined,
): UseQueryResult<CustomResponseTyping<AppCertification[]>> {
  return useQuery(userCourseCertificateHookOptions(courseUuid))
}

export function useCertificateByUuid(
  certificateUuid: string | null | undefined,
): UseQueryResult<CustomResponseTyping<AppCertification>> {
  return useQuery(certificateDetailHookOptions(certificateUuid))
}
