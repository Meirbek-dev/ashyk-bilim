'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { createIdempotencyKey } from '@/lib/api/headers'
import {
  getAssessmentDraft,
  getMyAssessmentSubmissions,
  getMySubmission,
  startAssessmentSubmission,
  saveAssessmentDraft,
  submitAssessmentDraft,
} from '../submission-client'
import type { AssessmentSubmissionRead } from '../domain/submission-wire'
import { isApiError } from '@/lib/api/assertSuccess'
import { cloneJsonValue } from '@/lib/json-clone'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { reportClientError } from '@/services/telemetry/client'
import type { ItemAnswer } from '../domain/items'

interface DraftRead {
  assessment_uuid: string
  submission: AssessmentSubmissionRead | null
}

interface SubmitOptions {
  violationCount?: number
  autoSubmit?: boolean
}

interface ConflictState {
  latest: AssessmentSubmissionRead
  localAnswers: Record<string, ItemAnswer>
}

export type AssessmentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error'

function answersFromSubmission(submission: AssessmentSubmissionRead | null | undefined): Record<string, ItemAnswer> {
  const answers = submission?.answers_json?.answers
  return answers ?? {}
}

function isOfflineRecoverable(error: unknown): boolean {
  if (!isApiError(error)) return false
  return error.status === 0 || error.code === 'CLIENT_TIMEOUT' || error.code === 'NETWORK_UNAVAILABLE'
}

export function useAssessmentSubmission(assessmentUuid: string | null | undefined, activityUuid?: string | null) {
  const t = useTranslations('Features.ActivityWorkspace')
  const queryClient = useQueryClient()
  const router = useRouter()
  const [localAnswers, setLocalAnswers] = useState<Record<string, ItemAnswer>>({})
  const [saveState, setSaveState] = useState<AssessmentSaveState>('idle')
  const [conflictState, setConflictState] = useState<ConflictState | null>(null)
  const reportedLoadErrorRef = useRef<string | null>(null)
  const localAnswersRef = useRef<Record<string, ItemAnswer>>({})
  const draftVersionRef = useRef<number | undefined>(undefined)
  const submissionIdRef = useRef<string | null>(null)
  const assessmentScopeRef = useRef(assessmentUuid)
  const saveInFlightRef = useRef<Promise<AssessmentSubmissionRead> | null>(null)
  const submitRetryRef = useRef<{ fingerprint: string; key: string } | null>(null)
  const lastSaveTimeRef = useRef<number>(0)
  const nextSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnswersRef = useRef<Record<string, ItemAnswer> | null>(null)
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => {
    assessmentScopeRef.current = assessmentUuid
    submissionIdRef.current = null
    draftVersionRef.current = undefined
    submitRetryRef.current = null
    lastSaveTimeRef.current = 0
    pendingAnswersRef.current = null
    return () => {
      if (nextSaveTimeoutRef.current) {
        clearTimeout(nextSaveTimeoutRef.current)
      }
    }
  }, [assessmentUuid])
  const submissionsQueryKey = useMemo(() => queryKeys.assessments.mySubmissions(assessmentUuid), [assessmentUuid])
  const normalizedActivityUuid = activityUuid ?? null

  const draftQueryOptions = useMemo(
    () =>
      queryOptions({
        queryKey: queryKeys.assessments.draft(assessmentUuid),
        queryFn: async () => {
          if (!assessmentUuid) throw new Error('Assessment is not ready')
          // A submit swaps the draft row for the submitted one before the
          // observer re-renders with `enabled: false`; an invalidation in that
          // window must not turn into a `submissions/draft` 404.
          const known = queryClient.getQueryData<AssessmentSubmissionRead[]>(submissionsQueryKey)
          if (known && !known.some(row => row.status === 'DRAFT')) {
            return { assessment_uuid: assessmentUuid, submission: null } satisfies DraftRead
          }
          return { assessment_uuid: assessmentUuid, submission: await getAssessmentDraft(assessmentUuid) }
        },
      }),
    [assessmentUuid, queryClient, submissionsQueryKey],
  )

  const invalidateAssessmentState = useCallback(async () => {
    if (!assessmentUuid) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
      queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.attemptState(assessmentUuid) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.detail(assessmentUuid),
      }),
      normalizedActivityUuid
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.assessments.activity(normalizedActivityUuid),
          })
        : Promise.resolve(),
    ])
  }, [assessmentUuid, draftQueryOptions.queryKey, normalizedActivityUuid, queryClient, submissionsQueryKey])

  const submissionsQuery = useQuery({
    ...queryOptions({
      queryKey: submissionsQueryKey,
      queryFn: async () => {
        if (!assessmentUuid) throw new Error('Assessment is not ready')
        return getMyAssessmentSubmissions(assessmentUuid)
      },
      enabled: Boolean(assessmentUuid),
    }),
  })

  // `submissions/draft` answers 404 when no attempt is open; only ask once the
  // attempt list says there is one (saves/starts seed the cache directly).
  const hasOpenDraft = submissionsQuery.data?.some(row => row.status === 'DRAFT') === true
  const draftQuery = useQuery({
    ...draftQueryOptions,
    enabled: Boolean(assessmentUuid) && hasOpenDraft,
  })

  const draft = draftQuery.data?.submission ?? null
  const submission = draft ?? submissionsQuery.data?.[0] ?? null
  const version = submission?.draft_version
  const draftVersion = submission?.draft_version

  useEffect(() => {
    localAnswersRef.current = localAnswers
  }, [localAnswers])

  useEffect(() => {
    draftVersionRef.current = draftVersion
    submissionIdRef.current = draft?.submission_uuid ?? null
  }, [draftVersion, draft?.submission_uuid])

  const ensureDraft = useCallback(async () => {
    if (!assessmentUuid) throw new Error('Assessment is not ready')
    if (submissionIdRef.current && draftVersionRef.current !== undefined) {
      return { id: submissionIdRef.current, version: draftVersionRef.current }
    }
    const opened = await startAssessmentSubmission(assessmentUuid)
    submissionIdRef.current = opened.id
    draftVersionRef.current = opened.draft_version
    return { id: opened.id, version: opened.draft_version }
  }, [assessmentUuid])

  const syncLatestSubmission = useCallback(
    (latest: AssessmentSubmissionRead) => {
      if (!assessmentUuid) return

      queryClient.setQueryData(draftQueryOptions.queryKey, {
        assessment_uuid: assessmentUuid,
        submission: latest.status === 'DRAFT' ? latest : null,
      } satisfies DraftRead)

      queryClient.setQueryData(submissionsQueryKey, (current: AssessmentSubmissionRead[] | undefined) => {
        const next = [...(current ?? [])]
        const existingIndex = next.findIndex(candidate => candidate.submission_uuid === latest.submission_uuid)
        if (existingIndex !== -1) {
          next[existingIndex] = latest
        } else {
          next.unshift(latest)
        }
        next.sort((left, right) => right.attempt_number - left.attempt_number)
        return next
      })
    },
    [assessmentUuid, draftQueryOptions.queryKey, queryClient, submissionsQueryKey],
  )

  const openConflict = useCallback(
    (latest: AssessmentSubmissionRead) => {
      syncLatestSubmission(latest)
      setConflictState({
        latest,
        localAnswers: cloneAnswers(localAnswersRef.current),
      })
      setSaveState('conflict')
    },
    [syncLatestSubmission],
  )

  const saveMutation = useMutation({
    mutationFn: async (answers: Record<string, ItemAnswer>) => {
      const active = await ensureDraft()
      const pending = saveAssessmentDraft(active.id, active.version, answers)
      saveInFlightRef.current = pending
      try {
        const latest = await pending
        if (assessmentScopeRef.current === assessmentUuid) draftVersionRef.current = latest.draft_version
        saveInFlightRef.current = null
        return latest
      } catch (error) {
        saveInFlightRef.current = null
        throw error
      }
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: async (latest, savedAnswers) => {
      if (assessmentScopeRef.current !== assessmentUuid) return
      draftVersionRef.current = latest.draft_version

      syncLatestSubmission(latest)
      setConflictState(null)
      setSaveState(areAnswersEqual(localAnswersRef.current, savedAnswers) ? 'saved' : 'dirty')
      await invalidateAssessmentState()
    },
    onError: async (error: unknown) => {
      if (assessmentScopeRef.current !== assessmentUuid) return
      if (isApiError(error) && error.status === 409) {
        const latest = submissionIdRef.current ? await getMySubmission(submissionIdRef.current).catch(() => null) : null
        if (latest) {
          draftVersionRef.current = latest.draft_version

          const latestAnswers = answersFromSubmission(latest)
          if (areAnswersEqual(localAnswersRef.current, latestAnswers)) {
            syncLatestSubmission(latest)
            setConflictState(null)
            setSaveState('saved')
            return
          }
          openConflict(latest)
        } else {
          setSaveState('dirty')
        }
        return
      }
      if (isApiError(error) && error.status === 429) {
        setSaveState('dirty')
        return
      }
      if (isOfflineRecoverable(error)) {
        setSaveState('dirty')
        return
      }
      setSaveState('error')
      void reportClientError({
        scope: 'assessment-flow',
        phase: 'save-draft',
        assessmentUuid,
        error: error instanceof Error ? error.message : 'Failed to save draft',
        ...(isApiError(error) ? { code: error.code, requestId: error.requestId } : {}),
      }).catch(() => undefined)
      toast.error(error instanceof Error ? error.message : 'Failed to save draft')
    },
  })

  const submitMutation = useMutation({
    mutationFn: async ({
      answers,
      violationCount,
    }: {
      answers: Record<string, ItemAnswer>
      violationCount?: number
      autoSubmit?: boolean
    }) => {
      if (nextSaveTimeoutRef.current) clearTimeout(nextSaveTimeoutRef.current)
      pendingAnswersRef.current = null
      if (saveInFlightRef.current) await saveInFlightRef.current
      const active = await ensureDraft()
      const fingerprint = JSON.stringify([active.id, active.version, answers, violationCount])
      if (submitRetryRef.current?.fingerprint !== fingerprint) {
        submitRetryRef.current = { fingerprint, key: createIdempotencyKey() }
      }
      return submitAssessmentDraft(active.id, active.version, answers, submitRetryRef.current.key, violationCount)
    },
    onSuccess: async latest => {
      submitRetryRef.current = null
      draftVersionRef.current = latest.draft_version

      syncLatestSubmission(latest)
      setConflictState(null)
      setSaveState('saved')
      if (assessmentUuid) {
        await invalidateAssessmentState()
      }
      // The outline sidebar, header badge and course progress read the
      // learner-state projection (server-rendered runtime + client query).
      await queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      router.refresh()
    },
    onError: async (error: unknown) => {
      if (isApiError(error) && error.status === 409) {
        const latest = submissionIdRef.current ? await getMySubmission(submissionIdRef.current).catch(() => null) : null
        if (latest) {
          draftVersionRef.current = latest.draft_version

          openConflict(latest)
        }
        toast.error(t('answersUpdatedElsewhere'))
        return
      }
      setSaveState('error')
      if (!isApiError(error) || error.status !== 429) {
        void reportClientError({
          scope: 'assessment-flow',
          phase: 'submit-assessment',
          assessmentUuid,
          error: error instanceof Error ? error.message : 'Failed to submit assessment',
          ...(isApiError(error) ? { code: error.code, requestId: error.requestId } : {}),
        }).catch(() => undefined)
      }
      toast.error(error instanceof Error ? error.message : t('submitFailed'))
    },
  })

  useEffect(() => {
    const loadError = draftQuery.error ?? submissionsQuery.error
    if (!loadError) return
    const errorStatus = isApiError(loadError) ? loadError.status : undefined
    if (errorStatus === 429) return
    const { message } = loadError
    const key = `${assessmentUuid ?? 'missing'}:${message}`
    if (reportedLoadErrorRef.current === key) return
    reportedLoadErrorRef.current = key
    void reportClientError({
      scope: 'assessment-flow',
      phase: 'load-submission-state',
      assessmentUuid,
      error: message,
      ...(isApiError(loadError) ? { code: loadError.code, requestId: loadError.requestId } : {}),
    }).catch(() => undefined)
  }, [assessmentUuid, draftQuery.error, submissionsQuery.error])

  // Render-phase synchronization to avoid synchronous setState inside useEffect
  const [lastAssessmentUuid, setLastAssessmentUuid] = useState<string | null | undefined>(undefined)
  const [lastSyncedSubmissionId, setLastSyncedSubmissionId] = useState<string | null>(null)

  if (assessmentUuid !== lastAssessmentUuid) {
    setLastAssessmentUuid(assessmentUuid)
    setLocalAnswers({})
    setSaveState('idle')
    setConflictState(null)
    setLastSyncedSubmissionId(null)
  } else if (
    assessmentUuid &&
    !draftQuery.isLoading &&
    !submissionsQuery.isLoading &&
    saveState !== 'dirty' &&
    saveState !== 'conflict' &&
    saveState !== 'error' &&
    !saveMutation.isPending &&
    !submitMutation.isPending
  ) {
    const currentSubmissionId = submission
      ? `${submission.submission_uuid}:${submission.draft_version}:${submission.status}`
      : 'none'
    if (currentSubmissionId !== lastSyncedSubmissionId) {
      setLastSyncedSubmissionId(currentSubmissionId)
      setLocalAnswers(answersFromSubmission(submission))
      if (saveState === 'idle' || saveState === 'saved') {
        setSaveState(submission ? 'saved' : 'idle')
      }
    }
  }

  const setItemAnswer = useCallback((itemUuid: string, answer: ItemAnswer) => {
    const next = { ...localAnswersRef.current, [itemUuid]: answer }
    localAnswersRef.current = next
    setLocalAnswers(next)
    setSaveState('dirty')
  }, [])

  const keepLocalVersion = useCallback(() => {
    setConflictState(null)
    setSaveState('dirty')
  }, [])

  const useServerVersion = useCallback(() => {
    if (!conflictState) return
    const answers = answersFromSubmission(conflictState.latest)
    localAnswersRef.current = answers
    setLocalAnswers(answers)
    setConflictState(null)
    setSaveState(conflictState.latest.status === 'DRAFT' ? 'saved' : 'idle')
  }, [conflictState])

  const { mutate: saveMutate, isPending: isSaving } = saveMutation
  const { mutateAsync: submitMutateAsync, isPending: isSubmitting } = submitMutation

  const save = useCallback(() => {
    if (isSubmitting) return
    if (nextSaveTimeoutRef.current) {
      clearTimeout(nextSaveTimeoutRef.current)
      nextSaveTimeoutRef.current = null
    }

    const answers = localAnswersRef.current
    const now = Date.now()
    const timeSinceLastSave = now - lastSaveTimeRef.current
    const isThrottled = timeSinceLastSave < 5000
    const isSavingPending = saveMutation.isPending

    if (isSavingPending || isThrottled) {
      pendingAnswersRef.current = answers

      if (!nextSaveTimeoutRef.current) {
        const delay = isSavingPending ? 1000 : 5000 - timeSinceLastSave
        nextSaveTimeoutRef.current = setTimeout(
          () => {
            nextSaveTimeoutRef.current = null
            saveRef.current()
          },
          Math.max(100, delay),
        )
      }
      return
    }

    pendingAnswersRef.current = null
    saveMutate(answers, {
      onSuccess: () => {
        lastSaveTimeRef.current = Date.now()
        if (pendingAnswersRef.current) {
          saveRef.current()
        }
      },
      onError: async (error: unknown) => {
        if (isApiError(error) && error.status === 429) {
          lastSaveTimeRef.current = 0
          setSaveState('dirty')
          if (!nextSaveTimeoutRef.current) {
            nextSaveTimeoutRef.current = setTimeout(() => {
              nextSaveTimeoutRef.current = null
              saveRef.current()
            }, 2000)
          }
        }
      },
    })
  }, [saveMutate, saveMutation.isPending, isSubmitting])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const submit = useCallback(
    (options?: SubmitOptions) =>
      submitMutateAsync({
        answers: localAnswersRef.current,
        ...(options?.violationCount !== undefined ? { violationCount: options.violationCount } : {}),
        ...(options?.autoSubmit !== undefined ? { autoSubmit: options.autoSubmit } : {}),
      }),
    [submitMutateAsync],
  )

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return
    const handleOnline = () => {
      if (saveState === 'dirty' && Object.keys(localAnswersRef.current).length > 0) {
        save()
      }
    }
    globalThis.addEventListener('online', handleOnline)
    return () => globalThis.removeEventListener('online', handleOnline)
  }, [save, saveState])

  return useMemo(
    () => ({
      answers: localAnswers,
      setItemAnswer,
      save,
      submit,
      draft,
      submission,
      submissions: submissionsQuery.data ?? [],
      status: submission?.status ?? null,
      version,
      saveState,
      conflict:
        conflictState !== null
          ? {
              latestVersion: conflictState.latest.draft_version,
              latestSavedAt: conflictState.latest.updated_at,
              localAnswerCount: Object.keys(conflictState.localAnswers).length,
              serverAnswerCount: Object.keys(answersFromSubmission(conflictState.latest)).length,
              onKeepLocalVersion: keepLocalVersion,
              onUseServerVersion: useServerVersion,
            }
          : null,
      isLoading: draftQuery.isLoading || submissionsQuery.isLoading,
      isSaving,
      isSubmitting,
      error: draftQuery.error ?? submissionsQuery.error,
    }),
    [
      draft,
      draftQuery.error,
      draftQuery.isLoading,
      conflictState,
      keepLocalVersion,
      localAnswers,
      save,
      isSaving,
      saveState,
      setItemAnswer,
      submissionsQuery.data,
      submissionsQuery.error,
      submissionsQuery.isLoading,
      submission,
      useServerVersion,
      submit,
      isSubmitting,
      version,
    ],
  )
}

function cloneAnswers(answers: Record<string, ItemAnswer>): Record<string, ItemAnswer> {
  return cloneJsonValue(answers)
}

function areAnswersEqual(left: Record<string, ItemAnswer>, right: Record<string, ItemAnswer>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
