'use client'

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

import { queryOptions, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { apiFetcher } from '@/lib/api-client'
import type { components } from '@/lib/api/generated/schema'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { reportClientError } from '@/services/telemetry/client'

import { assessmentByActivityQueryOptions } from '../queries'
import { isAssessmentEditable, canPublish, canSchedule, canArchive } from '../domain/lifecycle'
import { classifyValidationIssue } from '../domain/readiness'
import { policyFromAssessmentPolicy } from '../domain/policy'
import type { AssessmentPolicyDTO } from '../domain/policy'
import { assessmentTypeToKind } from '../domain/view-models'
import type {
  AssessmentKind,
  AssessmentSurface,
  StudioViewModel,
  AttemptViewModel,
} from '../domain/view-models'
import type { AssessmentItem } from '../domain/items'
import type { SubmissionStatus } from '../domain/submission-status'

type AssessmentDetail = components['schemas']['AssessmentRead']

interface ReadinessPayload {
  ok: boolean
  issues: { code: string; message: string; item_uuid?: string | null }[]
}

function readinessQueryOptions(assessmentUuid: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.assessments.readiness(assessmentUuid),
    queryFn: () => apiFetcher<ReadinessPayload>(`assessments/${assessmentUuid}/readiness`),
    enabled,
    retry: false,
  })
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface UseAssessmentOptions {
  surface: AssessmentSurface
}

export type AssessmentViewModel =
  | { surface: 'STUDIO'; vm: StudioViewModel; kind: AssessmentKind }
  | { surface: 'REVIEW'; kind: AssessmentKind }
  | { surface: 'ATTEMPT'; vm: AttemptViewModel; kind: AssessmentKind }
  | null

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
  vm: AssessmentViewModel
  isLoading: boolean
  error: Error | null
} {
  const normalizedUuid = activityUuid?.replace(/^activity_/, '') ?? ''

  const {
    data: assessment,
    isLoading,
    error,
  } = useQuery({
    ...assessmentByActivityQueryOptions(normalizedUuid),
    enabled: Boolean(normalizedUuid),
  })

  const reportedErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!error) return
    const key = `${options.surface}:${normalizedUuid}:${error.message}`
    if (reportedErrorRef.current === key) return
    reportedErrorRef.current = key
    void reportClientError({
      scope: 'assessment-flow',
      phase: 'load-assessment',
      surface: options.surface,
      activityUuid: normalizedUuid,
      error: error.message,
    }).catch(() => undefined)
  }, [error, normalizedUuid, options.surface])

  const readiness = useQuery({
    ...readinessQueryOptions(
      assessment?.assessment_uuid ?? '',
      options.surface === 'STUDIO' && Boolean(assessment),
    ),
  })

  if (isLoading || !assessment) {
    return { vm: null, isLoading, error }
  }

  const kind = assessmentTypeToKind(assessment.kind)
  if (!kind) {
    return { vm: null, isLoading: false, error: null }
  }

  const { surface } = options

  if (surface === 'STUDIO') {
    const { lifecycle } = assessment

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
      items: (assessment.items ?? []) as AssessmentItem[],
      validationIssues:
        readiness.data?.issues.map(issue =>
          classifyValidationIssue({
            code: issue.code,
            message: issue.message,
            itemUuid: issue.item_uuid ?? undefined,
          }),
        ) ?? [],
    }
    return { vm: { surface: 'STUDIO', vm, kind }, isLoading: false, error: null }
  }

  if (surface === 'REVIEW') {
    const reviewKind = assessmentTypeToKind(assessment.review_projection?.kind ?? assessment.kind)
    if (!reviewKind) {
      return { vm: null, isLoading: false, error: null }
    }
    return {
      vm: { surface: 'REVIEW', kind: reviewKind },
      isLoading: false,
      error: null,
    }
  }

  // ATTEMPT surface
  const attemptProjection = assessment.attempt_projection
  const effectivePolicy = attemptProjection?.effective_policy as
    | AssessmentPolicyDTO
    | null
    | undefined
  const vm: AttemptViewModel = {
    surface: 'ATTEMPT',
    kind,
    assessmentUuid: assessment.assessment_uuid,
    activityUuid: assessment.activity_uuid,
    title: assessment.title,
    description: assessment.description || null,
    dueAt: attemptProjection?.due_at ?? assessment.assessment_policy?.due_at ?? null,
    submissionStatus: (attemptProjection?.submission_status ?? null) as SubmissionStatus | null,
    releaseState: attemptProjection?.release_state ?? 'HIDDEN',
    score: {
      percent: attemptProjection?.score?.percent ?? null,
      source: attemptProjection?.score?.source ?? 'none',
    },
    policy: policyFromAssessmentPolicy(effectivePolicy ?? assessment.assessment_policy),
    items: (assessment.items ?? []) as AssessmentItem[],
    canEdit: attemptProjection?.can_edit ?? false,
    canSaveDraft: attemptProjection?.can_save_draft ?? false,
    canSubmit: attemptProjection?.can_submit ?? false,
    isReturnedForRevision: attemptProjection?.is_returned_for_revision ?? false,
    isResultVisible: attemptProjection?.is_result_visible ?? false,
    disabledActionReasons: attemptProjection?.disabled_action_reasons ?? [],
    serverNow: attemptProjection?.server_now ?? null,
    availableAt: attemptProjection?.available_at ?? null,
    closesAt: attemptProjection?.closes_at ?? null,
    timeRemainingSeconds: attemptProjection?.time_remaining_seconds ?? null,
    contentVersion: attemptProjection?.content_version ?? assessment.content_version ?? 1,
    policyVersion: attemptProjection?.policy_version ?? assessment.policy_version ?? 1,
    // Phase 1 — server-driven action state
    canStart: attemptProjection?.can_start ?? false,
    canContinue: attemptProjection?.can_continue ?? false,
    canViewResult: attemptProjection?.can_view_result ?? false,
    canStartRevision: attemptProjection?.can_start_revision ?? false,
    recommendedAction:
      (attemptProjection?.recommended_action as AttemptViewModel['recommendedAction']) ??
      'noAction',
    primaryButtonLabelKey: attemptProjection?.primary_button_label_key ?? 'noAction',
    startedAt: attemptProjection?.started_at ?? null,
    timerStartedAt: attemptProjection?.timer_started_at ?? null,
    timerExpiresAt: attemptProjection?.timer_expires_at ?? null,
  }
  return { vm: { surface: 'ATTEMPT', vm, kind }, isLoading: false, error: null }
}

// ── Convenience selector hooks ─────────────────────────────────────────────────

export function useAssessmentStudio(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'STUDIO' })
}

export function useAssessmentAttempt(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'ATTEMPT' })
}

export function useAssessmentReview(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'REVIEW' })
}
