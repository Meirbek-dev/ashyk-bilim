'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  certificateDetailQueryOptions,
  userCertificatesQueryOptions,
  userCourseCertificatesQueryOptions,
} from '@/features/courses/queries/course.query';

function userCourseCertificateHookOptions(courseUuid: string | null | undefined) {
  const normalizedCourseUuid = courseUuid ?? 'disabled';

  return queryOptions({
    ...userCourseCertificatesQueryOptions(normalizedCourseUuid),
    enabled: Boolean(courseUuid),
  });
}

function certificateDetailHookOptions(certificateUuid: string | null | undefined) {
  const normalizedCertificateUuid = certificateUuid ?? 'disabled';

  return queryOptions({
    ...certificateDetailQueryOptions(normalizedCertificateUuid),
    enabled: Boolean(certificateUuid),
  });
}

export function useUserCertificates() {
  return useQuery(userCertificatesQueryOptions());
}

export function useUserCertificateByCourse(courseUuid: string | null | undefined) {
  return useQuery(userCourseCertificateHookOptions(courseUuid));
}

export function useCertificateByUuid(certificateUuid: string | null | undefined) {
  return useQuery(certificateDetailHookOptions(certificateUuid));
}
