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
import { apiFetcher } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';

import { isAssessmentEditable, canPublish, canSchedule, canArchive } from '../domain/lifecycle';
import type { AssessmentLifecycle } from '../domain/lifecycle';
import { policyFromAssessmentPolicy } from '../domain/policy';
import type { AssessmentPolicyDTO } from '../domain/policy';
import type { AssessmentKind, AssessmentSurface, StudioViewModel, AttemptViewModel } from '../domain/view-models';

// ── Internal activity shape (subset of what the API returns) ──────────────────

interface ActivityDetail {
  id: number;
  activity_uuid: string;
  name: string;
  activity_type: string;
  published: boolean;
  details?: Record<string, unknown> | null;
  assessment_policy?: AssessmentPolicyDTO | null;
}

function activityDetailQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.activities.detail(activityUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}activities/${activityUuid}`) as Promise<ActivityDetail>,
    enabled: Boolean(activityUuid),
  });
}

function activityTypeToKind(activityType: string): AssessmentKind | null {
  switch (activityType) {
    case 'TYPE_ASSIGNMENT': {
      return 'TYPE_ASSIGNMENT';
    }
    case 'TYPE_EXAM': {
      return 'TYPE_EXAM';
    }
    case 'TYPE_CODE_CHALLENGE': {
      return 'TYPE_CODE_CHALLENGE';
    }
    case 'TYPE_QUIZ': {
      return 'TYPE_QUIZ';
    }
    default: {
      return null;
    }
  }
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
    data: activity,
    isLoading,
    error,
  } = useQuery({
    ...activityDetailQueryOptions(normalizedUuid),
    enabled: Boolean(normalizedUuid),
  });

  if (isLoading || !activity) {
    return { vm: null, isLoading, error };
  }

  const kind = activityTypeToKind(activity.activity_type);
  if (!kind) {
    return { vm: null, isLoading: false, error: null };
  }

  const { surface } = options;

  if (surface === 'STUDIO') {
    // Phase 1: derive lifecycle from the activity's published flag.
    // Assignment kind has its own lifecycle via AssignmentStatus; exams use boolean.
    // Future: load kind-specific metadata (assignment.status, exam.settings, etc.)
    // to produce a richer StudioViewModel.
    const lifecycle = lifecycleFromActivity(activity);

    const vm: StudioViewModel = {
      surface: 'STUDIO',
      kind,
      activityUuid: activity.activity_uuid,
      title: activity.name,
      lifecycle,
      isEditable: isAssessmentEditable(lifecycle),
      canPublish: canPublish(lifecycle),
      canSchedule: canSchedule(lifecycle),
      canArchive: canArchive(lifecycle),
      scheduledAt: null,
      policy: policyFromAssessmentPolicy(activity.assessment_policy),
      validationIssues: [],
    };
    return { vm: { surface: 'STUDIO', vm, kind }, isLoading: false, error: null };
  }

  if (surface === 'REVIEW') {
    return { vm: { surface: 'REVIEW', kind }, isLoading: false, error: null };
  }

  // ATTEMPT surface
  const vm: AttemptViewModel = {
    surface: 'ATTEMPT',
    kind,
    activityUuid: activity.activity_uuid,
    title: activity.name,
    description: null,
    dueAt: null,
    submissionStatus: null,
    releaseState: 'HIDDEN',
    score: { percent: null, source: 'none' },
    policy: policyFromAssessmentPolicy(activity.assessment_policy),
    canEdit: true,
    canSaveDraft: true,
    canSubmit: true,
    isReturnedForRevision: false,
    isResultVisible: false,
  };
  return { vm: { surface: 'ATTEMPT', vm, kind }, isLoading: false, error: null };
}

function lifecycleFromActivity(activity: ActivityDetail): AssessmentLifecycle {
  const raw = activity.details?.lifecycle_status;
  if (raw === 'DRAFT' || raw === 'SCHEDULED' || raw === 'PUBLISHED' || raw === 'ARCHIVED') return raw;
  return activity.published ? 'PUBLISHED' : 'DRAFT';
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
