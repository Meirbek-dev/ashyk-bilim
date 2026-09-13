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

import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { apiJson } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { reportClientError } from '@/services/telemetry/client'

import { assessmentByActivityQueryOptions } from '../queries'
import { canArchive, canPublish, canSchedule, isAssessmentEditable } from '../domain/lifecycle'
import { classifyValidationIssue } from '../domain/readiness'
import { itemFromWire, lifecycleFromWire, policyFromWire } from '../domain/assessment-wire'
import { AttemptState, Readiness } from '@/lib/api/generated/zod'
import { unixToIso } from '@/lib/api/contract'
import { getMyAssessmentSubmissions } from '../submission-client'
import { assessmentTypeToKind } from '../domain/view-models'
import type { AssessmentKind, AssessmentSurface, AttemptViewModel, StudioViewModel } from '../domain/view-models'

function readinessQueryOptions(assessmentUuid: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.assessments.readiness(assessmentUuid),
    queryFn: () => apiJson(`assessments/${assessmentUuid}/readiness`, undefined, value => Readiness.parse(value)),
    enabled,
    retry: false,
  })
}

/** A hand-in the teacher has not released yet (pending grading, or graded but unpublished). */
export function isAwaitingRelease(row: { status: string; release_state: string } | undefined): boolean {
  return row?.release_state === 'awaiting_release' || row?.status === 'PENDING'
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
function useAssessment(
  activityUuid: string | null | undefined,
  options: UseAssessmentOptions,
): {
  vm: AssessmentViewModel
  isLoading: boolean
  error: Error | null
} {
  const normalizedUuid = activityUuid ?? ''

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
    ...readinessQueryOptions(assessment?.id ?? '', options.surface === 'STUDIO' && Boolean(assessment)),
  })

  const attempt = useQuery({
    queryKey: queryKeys.assessments.attemptState(assessment?.id),
    queryFn: () =>
      apiJson(`assessments/${assessment!.id}/attempt-state`, undefined, value => AttemptState.parse(value)),
    enabled: options.surface === 'ATTEMPT' && Boolean(assessment),
  })
  const submissions = useQuery({
    queryKey: queryKeys.assessments.mySubmissions(assessment?.id),
    queryFn: () => getMyAssessmentSubmissions(assessment!.id),
    enabled: options.surface === 'ATTEMPT' && Boolean(assessment),
    // UX-061: a hand-in waiting on the teacher polls for the release while the
    // tab is visible (default `refetchIntervalInBackground: false`), stops once seen.
    refetchInterval: query => (isAwaitingRelease(query.state.data?.[0]) ? 10_000 : false),
  })
  // The release flipped under an open page: the outline/progress projection
  // (passed, score) must follow, or the headline shows a stale verdict.
  const queryClient = useQueryClient()
  const awaiting = isAwaitingRelease(submissions.data?.[0])
  const wasAwaitingRef = useRef(false)
  useEffect(() => {
    if (wasAwaitingRef.current && !awaiting) {
      void queryClient.invalidateQueries({ queryKey: ['learner-course'] })
    }
    wasAwaitingRef.current = awaiting
  }, [awaiting, queryClient])

  if (isLoading || !assessment) {
    return { vm: null, isLoading, error }
  }

  const kind = assessmentTypeToKind(assessment.kind)
  if (!kind) {
    return { vm: null, isLoading: false, error: null }
  }

  const { surface } = options

  if (surface === 'STUDIO') {
    if (readiness.isLoading || readiness.error) {
      return { vm: null, isLoading: readiness.isLoading, error: readiness.error }
    }
    const lifecycle = lifecycleFromWire[assessment.lifecycle]

    const vm: StudioViewModel = {
      surface: 'STUDIO',
      kind,
      assessmentUuid: assessment.id,
      activityUuid: assessment.activity_id,
      title: assessment.title,
      lifecycle,
      isEditable: isAssessmentEditable(lifecycle),
      canPublish: canPublish(lifecycle),
      canSchedule: canSchedule(lifecycle),
      canArchive: canArchive(lifecycle),
      scheduledAt: unixToIso(assessment.scheduled_at_unix),
      policy: policyFromWire(assessment.policy),
      items: assessment.items.map(itemFromWire),
      validationIssues:
        readiness.data?.issues.map(issue =>
          classifyValidationIssue({
            code: issue.code,
            message: issue.message,
            ...(issue.item_id ? { itemUuid: issue.item_id } : {}),
          }),
        ) ?? [],
    }
    return { vm: { surface: 'STUDIO', vm, kind }, isLoading: false, error: null }
  }

  if (surface === 'REVIEW') {
    const reviewKind = assessmentTypeToKind(assessment.kind)
    if (!reviewKind) {
      return { vm: null, isLoading: false, error: null }
    }
    return {
      vm: { surface: 'REVIEW', kind: reviewKind },
      isLoading: false,
      error: null,
    }
  }

  if (attempt.isLoading || submissions.isLoading || !attempt.data) {
    return {
      vm: null,
      isLoading: attempt.isLoading || submissions.isLoading,
      error: attempt.error ?? submissions.error,
    }
  }
  if (submissions.error) return { vm: null, isLoading: false, error: submissions.error }

  const state = attempt.data
  const latest = submissions.data?.find(row => row.id === state.draft_id) ?? submissions.data?.[0]
  const policy = policyFromWire(assessment.policy, state.effective)
  const visible = latest?.release_state === 'visible' && policy.resultReviewAllowed
  const releaseStates = {
    hidden: 'HIDDEN',
    awaiting_release: 'AWAITING_RELEASE',
    visible: 'VISIBLE',
    returned_for_revision: 'RETURNED_FOR_REVISION',
  } as const
  const recommendedAction = recommendedActionFor(state, latest, visible)
  const startedAt = latest?.status === 'DRAFT' ? latest.started_at_unix : null
  const timeLimit = state.effective.time_limit_seconds
  const vm: AttemptViewModel = {
    surface: 'ATTEMPT',
    kind,
    assessmentUuid: assessment.id,
    activityUuid: assessment.activity_id,
    title: assessment.title,
    description: assessment.description || null,
    dueAt: policy.dueAt,
    submissionStatus: latest?.status ?? null,
    releaseState: latest ? releaseStates[latest.release_state] : 'HIDDEN',
    score: {
      percent: latest?.final_score ?? latest?.auto_score ?? null,
      source:
        typeof latest?.final_score === 'number' ? 'final' : typeof latest?.auto_score === 'number' ? 'auto' : 'none',
    },
    policy,
    items: assessment.items.map(itemFromWire),
    itemScores: visible ? Object.fromEntries((latest?.grading?.items ?? []).map(item => [item.item_id, item])) : {},
    canEdit: state.can_continue || state.can_start,
    canSaveDraft: state.can_continue,
    canSubmit: state.can_continue || state.can_start,
    isReturnedForRevision: state.revision_requested,
    isResultVisible: visible,
    passingScore: state.effective.passing_score ?? null,
    disabledActionReasons: state.disabled_reasons,
    serverNow: null,
    availableAt: unixToIso(state.opens_at_unix),
    closesAt: !state.effective.allow_late
      ? policy.dueAt
      : state.effective.late_policy.kind === 'cutoff'
        ? unixToIso(state.effective.late_policy.cutoff_at_unix)
        : null,
    timeRemainingSeconds: latest?.status === 'DRAFT' ? (latest.time_remaining_seconds ?? null) : null,
    contentVersion: assessment.content_version,
    policyVersion: assessment.policy_version,
    canStart: state.can_start,
    canContinue: state.can_continue,
    canViewResult: visible,
    canStartRevision: state.revision_requested && state.can_start,
    nextAttemptCapPercent:
      assessment.policy.attempt_penalty_percent > 0 && state.attempts_used > 0
        ? Math.max(0, 100 - assessment.policy.attempt_penalty_percent * state.attempts_used)
        : null,
    attemptCapPercent:
      visible && assessment.policy.attempt_penalty_percent > 0 && (latest?.attempt_number ?? 1) > 1
        ? Math.max(0, 100 - assessment.policy.attempt_penalty_percent * ((latest?.attempt_number ?? 1) - 1))
        : null,
    latePenaltyPct: visible && latest?.late_penalty_pct ? latest.late_penalty_pct : null,
    autoSubmitReason: latest?.auto_submit_reason ?? null,
    generalFeedback: visible && latest?.grading?.feedback?.trim() ? latest.grading.feedback : null,
    recommendedAction,
    primaryButtonLabelKey: recommendedAction,
    startedAt: unixToIso(startedAt),
    timerStartedAt: unixToIso(startedAt),
    timerExpiresAt:
      typeof startedAt === 'number' && typeof timeLimit === 'number' ? unixToIso(startedAt + timeLimit) : null,
  }
  return { vm: { surface: 'ATTEMPT', vm, kind }, isLoading: false, error: null }
}

/**
 * A released result wins over "you may start again": with unlimited attempts
 * the learner must still see the score they just earned (the result card
 * offers the retake). A hand-in the teacher has not released yet — pending
 * grading or graded but unpublished — is "received, awaiting review", never
 * the red "blocked" lock (UX-032).
 */
export function recommendedActionFor(
  state: Pick<AttemptState, 'can_continue' | 'can_start' | 'revision_requested' | 'disabled_reasons'>,
  latest: { status: string; release_state: string } | undefined,
  visible: boolean,
): AttemptViewModel['recommendedAction'] {
  if (state.can_continue) return 'continueDraft'
  if (state.revision_requested && state.can_start) return 'startRevision'
  if (visible) return 'viewResult'
  if (state.can_start) return 'start'
  if (isAwaitingRelease(latest)) return 'waitForRelease'
  return state.disabled_reasons.length ? 'blocked' : 'noAction'
}

// ── Convenience selector hooks ─────────────────────────────────────────────────

export function useAssessmentStudio(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'STUDIO' })
}

export function useAssessmentAttempt(activityUuid: string | null | undefined) {
  return useAssessment(activityUuid, { surface: 'ATTEMPT' })
}
