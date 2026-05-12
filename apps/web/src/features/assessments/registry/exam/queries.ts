'use client';

import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { normalizeExamPolicySettings } from './policySettings';

function assessmentToExam(assessment: any) {
  return {
    ...assessment,
    exam_uuid: assessment.assessment_uuid,
    settings: normalizeExamPolicySettings(assessment.assessment_policy?.settings_json ?? {}),
  };
}

export function examActivityQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.activity(activityUuid),
    queryFn: async () => assessmentToExam(await apiFetcher(`assessments/activity/${activityUuid}`)),
  });
}

export function examDetailQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.detail(examUuid),
    queryFn: async () => assessmentToExam(await apiFetcher(`assessments/${examUuid}`)),
  });
}

export function examQuestionsQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.questions(examUuid),
    queryFn: () => apiFetcher(`assessments/${examUuid}/exam/questions`),
  });
}

export function examMyAttemptsQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.myAttempt(examUuid),
    queryFn: () => apiFetcher(`assessments/${examUuid}/me`),
  });
}

export function examAllAttemptsQueryOptions(examUuid: string) {
  return queryOptions({
    queryKey: queryKeys.exams.allAttempts(examUuid),
    queryFn: () => apiFetcher(`assessments/${examUuid}/submissions`),
  });
}

export function examConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.exams.config(),
    queryFn: () => apiFetcher<{ time_limit?: { min: number; max: number } }>(`assessments/exam/config`),
  });
}
