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
import { isApiError } from '@/lib/api/assertSuccess'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { reportClientError } from '@/services/telemetry/client'

import { assessmentByActivityQueryOptions } from '../queries'
import { canArchive, canPublish, canSchedule, isAssessmentEditable } from '../domain/lifecycle'
import { classifyValidationIssue } from '../domain/readiness'
import { itemFromWire, lifecycleFromWire, policyFromWire } from '../domain/assessment-wire'
import { AttemptState, Readiness } from '@/lib/api/generated/zod'
import type { AttemptStateOutput } from '@/lib/api/generated/zod'
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
    // BUG-158: a teacher may gate the retake (or spend the last attempt) while
    // the learner sits on the result page — follow the server on focus and
    // every 15 s once a hand-in exists, the same policy as the release poll.
    refetchOnWindowFocus: 'always',
    refetchInterval: query => {
      const state = query.state.data
      return state && !state.can_continue && state.attempts_used > 0 ? 15_000 : false
    },
  })
  const submissions = useQuery({
    queryKey: queryKeys.assessments.mySubmissions(assessment?.id),
    queryFn: () => getMyAssessmentSubmissions(assessment!.id),
    enabled: options.surface === 'ATTEMPT' && Boolean(assessment),
    // UX-061: a hand-in waiting on the teacher polls for the release while the
    // tab is visible (default `refetchIntervalInBackground: false`); UX-115: a
    // released result keeps following the teacher (a republished feedback
    // reaches the open review) every 30 s + on focus, like the teacher's own
    // results tab.
    refetchOnWindowFocus: 'always',
    refetchInterval: query => {
      const latest = query.state.data?.[0]
      if (isAwaitingRelease(latest)) return 10_000
      return latest?.release_state === 'visible' ? 30_000 : false
    },
  })
  // A released grade changed under an open page (release flip, re-grade,
  // override — UX-121): the outline/progress projection (passed, score) must
  // follow, or the headline shows a stale verdict.
  const queryClient = useQueryClient()
  const releasedGrades =
    submissions.data
      ?.filter(row => row.release_state === 'visible')
      .map(row => `${row.id}:${row.final_score ?? ''}:${row.graded_at_unix ?? ''}`)
      .join('|') ?? null
  const releasedGradesRef = useRef<string | null>(null)
  useEffect(() => {
    if (releasedGrades === null) return
    if (releasedGradesRef.current !== null && releasedGradesRef.current !== releasedGrades) {
      void queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      void queryClient.invalidateQueries({ queryKey: ['student-activity'] })
    }
    releasedGradesRef.current = releasedGrades
  }, [releasedGrades, queryClient])

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

  // UX-213: off the allowlist the take gate (attempt-state) answers 403 while
  // the learner's own attempts stay readable — a read-only page with the
  // «no new attempts» notice, not a page error. No course access fails
  // `submissions/me` too and stays an error below.
  const accessClosed = isApiError(attempt.error) && attempt.error.status === 403 && submissions.isSuccess
  if (!accessClosed && (attempt.isLoading || submissions.isLoading || !attempt.data)) {
    return {
      vm: null,
      isLoading: attempt.isLoading || submissions.isLoading,
      error: attempt.error ?? submissions.error,
    }
  }
  if (submissions.error) return { vm: null, isLoading: false, error: submissions.error }
  // UX-153: a focus/poll refetch that the server refuses (access restricted,
  // assessment gone) replaces the stale «Start» with the refusal; transient
  // failures keep the last good state.
  if (!accessClosed && attempt.error && isApiError(attempt.error) && attempt.error.status < 500) {
    return { vm: null, isLoading: false, error: attempt.error }
  }

  const state: AttemptStateOutput =
    accessClosed || !attempt.data
      ? {
          attempts_used: (submissions.data ?? []).filter(row => row.status !== 'DRAFT').length,
          attempts_remaining: 0,
          can_continue: false,
          can_start: false,
          disabled_reasons: [],
          draft_id: null,
          effective: {
            allow_late: assessment.policy.allow_late,
            due_at_unix: assessment.policy.due_at_unix,
            late_policy: assessment.policy.late_policy,
            max_attempts: assessment.policy.max_attempts,
            override_applied: false,
            passing_score: assessment.policy.passing_score,
            time_limit_seconds: assessment.policy.time_limit_seconds,
            waive_late_penalty: false,
          },
          is_teacher_preview: false,
          lifecycle: assessment.lifecycle,
          opens_at_unix: null,
          revision_requested: false,
        }
      : attempt.data
  const { latest, pendingAttemptNumber } = shownSubmission(submissions.data ?? [], state.draft_id)
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
    accessClosed,
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
    attemptReviews: visible
      ? (submissions.data ?? [])
          .filter(row => row.status !== 'DRAFT' && row.release_state === 'visible')
          .map(row => ({
            attemptNumber: row.attempt_number,
            percent: row.final_score ?? row.auto_score ?? null,
            itemScores: Object.fromEntries((row.grading?.items ?? []).map(item => [item.item_id, item])),
            generalFeedback: row.grading?.feedback?.trim() ? row.grading.feedback : null,
            annulled: row.auto_submit_reason === 'integrity_violation',
          }))
      : [],
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
    pendingAttemptNumber,
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
 * The attempt the card is about: the open draft; else, while the newest
 * hand-in still waits on the teacher, the newest released one — a retake must
 * not hide the grade of record (UX-123), which then names the pending attempt
 * as a secondary line; else the newest.
 */
export function shownSubmission<
  T extends { id: string; status: string; release_state: string; attempt_number: number },
>(
  rows: readonly T[],
  draftId: string | null | undefined,
): { latest: T | undefined; pendingAttemptNumber: number | null } {
  const newest = rows[0]
  const draft = rows.find(row => row.id === draftId)
  const released = isAwaitingRelease(newest)
    ? rows.find(row => row.status !== 'DRAFT' && row.release_state === 'visible')
    : undefined
  const latest = draft ?? released ?? newest
  return { latest, pendingAttemptNumber: released && newest && latest === released ? newest.attempt_number : null }
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
