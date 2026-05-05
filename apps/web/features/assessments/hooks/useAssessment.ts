'use client';

/**
 * useAssessment — unified data hook for any assessable activity.
 *
 * Phase 1: fetches the activity metadata and derives the surface view model.
 * Each kind may still have its own additional queries (tasks, questions, etc.);
 * those are owned by the kind registry contribution and accessed via kind-
 * specific hooks until Phase 3–4.
 *
 * Phase 3–4 will extend this hook to load kind data in parallel and return
 * fully-populated StudioViewModel / AttemptViewModel from the domain layer.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiFetcher } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { reportClientError } from '@/services/telemetry/client';

import { isAssessmentEditable, canPublish, canSchedule, canArchive } from '../domain/lifecycle';
import type { AssessmentLifecycle } from '../domain/lifecycle';
import { policyFromAssessmentPolicy } from '../domain/policy';
import type { AssessmentPolicyDTO } from '../domain/policy';
import { assessmentTypeToKind } from '../domain/view-models';
import type { AssessmentKind, AssessmentSurface, StudioViewModel, AttemptViewModel } from '../domain/view-models';
import type { AssessmentItem } from '../domain/items';

// ── Internal activity shape (subset of what the API returns) ──────────────────

interface AssessmentDetail {
  id: number;
  assessment_uuid: string;
  activity_id: number;
  activity_uuid: string;
  kind: 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
  title: string;
  description: string;
  lifecycle: AssessmentLifecycle;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  items: AssessmentItem[];
  assessment_policy?: AssessmentPolicyDTO | null;
  attempt_projection?: AttemptProjectionPayload | null;
  review_projection?: ReviewProjectionPayload | null;
}

interface AssessmentScoreProjection {
  percent: number | null;
  source: 'auto' | 'teacher' | 'none';
}

interface AttemptProjectionPayload {
  assessment_uuid: string;
  submission_uuid?: string | null;
  submission_status?: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED' | null;
  release_state?: 'HIDDEN' | 'AWAITING_RELEASE' | 'VISIBLE' | 'RETURNED_FOR_REVISION';
  can_edit: boolean;
  can_save_draft: boolean;
  can_submit: boolean;
  is_returned_for_revision: boolean;
  is_result_visible: boolean;
  score?: AssessmentScoreProjection | null;
}

interface ReviewProjectionPayload {
  assessment_uuid: string;
  activity_id: number;
  activity_uuid: string;
  title: string;
  kind: 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
}

interface ReadinessPayload {
  ok: boolean;
  issues: { code: string; message: string; item_uuid?: string | null }[];
}

function assessmentByActivityQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.assessments.activity(activityUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}assessments/activity/${activityUuid}`) as Promise<AssessmentDetail>,
    enabled: Boolean(activityUuid),
  });
}

function readinessQueryOptions(assessmentUuid: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.assessments.readiness(assessmentUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}assessments/${assessmentUuid}/readiness`) as Promise<ReadinessPayload>,
    enabled,
    retry: false,
  });
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface UseAssessmentOptions {
  surface: AssessmentSurface;
}

export type AssessmentViewModel =
  | { surface: 'STUDIO'; vm: StudioViewModel; kind: AssessmentKind }
  | { surface: 'REVIEW'; kind: AssessmentKind }
  | { surface: 'ATTEMPT'; vm: AttemptViewModel; kind: AssessmentKind }
  | null;

/**
 * Fetches activity metadata and returns a typed view model for the requested
 * surface. Returns null while loading or if the activity is not assessable.
 *
 * @param activityUuid  Raw activity UUID (with or without "activity_" prefix).
 * @param options.surface  Which product surface the caller is rendering.
 */
export function useAssessment(
  activityUuid: string | null | undefined,
  options: UseAssessmentOptions,
): {
  vm: AssessmentViewModel;
  isLoading: boolean;
  error: Error | null;
} {
  const normalizedUuid = activityUuid?.replace(/^activity_/, '') ?? '';

  const {
    data: assessment,
    isLoading,
    error,
  } = useQuery({
    ...assessmentByActivityQueryOptions(normalizedUuid),
    enabled: Boolean(normalizedUuid),
  });

  const reportedErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const key = `${options.surface}:${normalizedUuid}:${error.message}`;
    if (reportedErrorRef.current === key) return;
    reportedErrorRef.current = key;
    void reportClientError({
      scope: 'assessment-flow',
      phase: 'load-assessment',
      surface: options.surface,
      activityUuid: normalizedUuid,
      error: error.message,
    }).catch(() => undefined);
  }, [error, normalizedUuid, options.surface]);

  const readiness = useQuery({
    ...readinessQueryOptions(assessment?.assessment_uuid ?? '', options.surface === 'STUDIO' && Boolean(assessment)),
  });

  if (isLoading || !assessment) {
    return { vm: null, isLoading, error };
  }

  const kind = assessmentTypeToKind(assessment.kind);
  if (!kind) {
    return { vm: null, isLoading: false, error: null };
  }

  const { surface } = options;

  if (surface === 'STUDIO') {
    const { lifecycle } = assessment;

    const vm: StudioViewModel = {
      surface: 'STUDIO',
      kind,
      assessmentUuid: assessment.assessment_uuid,
      activityUuid: assessment.activity_uuid,
      title: assessment.title,
      lifecycle,
      isEditable: isAssessmentEditable(lifecycle),
      canPublish: canPublish(lifecycle),
      canSchedule: canSchedule(lifecycle),
      canArchive: canArchive(lifecycle),
      scheduledAt: assessment.scheduled_at ?? null,
      policy: policyFromAssessmentPolicy(assessment.assessment_policy),
      items: assessment.items,
      validationIssues:
        readiness.data?.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          itemUuid: issue.item_uuid ?? undefined,
        })) ?? [],
    };
    return { vm: { surface: 'STUDIO', vm, kind }, isLoading: false, error: null };
  }

  if (surface === 'REVIEW') {
    const reviewKind = assessmentTypeToKind(assessment.review_projection?.kind ?? assessment.kind);
    if (!reviewKind) {
      return { vm: null, isLoading: false, error: null };
    }
    return { vm: { surface: 'REVIEW', kind: reviewKind }, isLoading: false, error: null };
  }

  // ATTEMPT surface
  const attemptProjection = assessment.attempt_projection;
  const vm: AttemptViewModel = {
    surface: 'ATTEMPT',
    kind,
    assessmentUuid: assessment.assessment_uuid,
    activityUuid: assessment.activity_uuid,
    title: assessment.title,
    description: assessment.description || null,
    dueAt: assessment.assessment_policy?.due_at ?? null,
    submissionStatus: attemptProjection?.submission_status ?? null,
    releaseState: attemptProjection?.release_state ?? 'HIDDEN',
    score: attemptProjection?.score ?? { percent: null, source: 'none' },
    policy: policyFromAssessmentPolicy(assessment.assessment_policy),
    items: assessment.items,
    canEdit: attemptProjection?.can_edit ?? false,
    canSaveDraft: attemptProjection?.can_save_draft ?? false,
    canSubmit: attemptProjection?.can_submit ?? false,
    isReturnedForRevision: attemptProjection?.is_returned_for_revision ?? false,
    isResultVisible: attemptProjection?.is_result_visible ?? false,
  };
  return { vm: { surface: 'ATTEMPT', vm, kind }, isLoading: false, error: null };
}

// ── Convenience selector hooks ─────────────────────────────────────────────────

export function useAssessmentStudio(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'STUDIO' });
}

export function useAssessmentAttempt(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'ATTEMPT' });
}

export function useAssessmentReview(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'REVIEW' });
}
