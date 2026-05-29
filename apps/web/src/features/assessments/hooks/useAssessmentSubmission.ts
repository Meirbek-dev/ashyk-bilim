'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import type { components } from '@/lib/api/generated/schema'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { reportClientError } from '@/services/telemetry/client'
import type { ItemAnswer } from '../domain/items'

export type AssessmentSubmissionRead = components['schemas']['StudentSubmissionRead'] & {
  draft_version?: number
}

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
  return answers && typeof answers === 'object' ? (answers as Record<string, ItemAnswer>) : {}
}

async function readJsonOrThrow(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof payload?.detail === 'string'
        ? payload.detail
        : typeof payload?.detail?.message === 'string'
          ? payload.detail.message
          : response.statusText || 'Request failed'
    const error = new Error(message) as Error & { status?: number; payload?: any }
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export function useAssessmentSubmission(assessmentUuid: string | null | undefined, activityUuid?: string | null) {
  const t = useTranslations('Features.ActivityWorkspace')
  const queryClient = useQueryClient()
  const [localAnswers, setLocalAnswers] = useState<Record<string, ItemAnswer>>({})
  const [saveState, setSaveState] = useState<AssessmentSaveState>('idle')
  const [conflictState, setConflictState] = useState<ConflictState | null>(null)
  const [reportedLoadError, setReportedLoadError] = useState<string | null>(null)
  const localAnswersRef = useRef<Record<string, ItemAnswer>>({})
  const versionRef = useRef<number | undefined>(undefined)
  const draftVersionRef = useRef<number | undefined>(undefined)
  const lastSaveTimeRef = useRef<number>(0)
  const nextSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnswersRef = useRef<Record<string, ItemAnswer> | null>(null)

  useEffect(() => {
    return () => {
      if (nextSaveTimeoutRef.current) {
        clearTimeout(nextSaveTimeoutRef.current)
      }
    }
  }, [])
  const submissionsQueryKey = useMemo(
    () => ['assessments', 'submissions', 'me', assessmentUuid || 'missing'] as const,
    [assessmentUuid],
  )
  const normalizedActivityUuid = activityUuid?.replace(/^activity_/, '') ?? null

  const draftQueryOptions = useMemo(
    () =>
      queryOptions({
        queryKey: queryKeys.assessments.draft(assessmentUuid),
        queryFn: async () => {
          const response = await apiFetch(`assessments/${assessmentUuid}/draft`)
          return (await readJsonOrThrow(response)) as DraftRead
        },
      }),
    [assessmentUuid],
  )

  const invalidateAssessmentState = useCallback(async () => {
    if (!assessmentUuid) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
      queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
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

  const draftQuery = useQuery({
    ...draftQueryOptions,
    enabled: Boolean(assessmentUuid),
  })

  const submissionsQuery = useQuery({
    ...queryOptions({
      queryKey: submissionsQueryKey,
      queryFn: async () => {
        const response = await apiFetch(`assessments/${assessmentUuid}/me`)
        return (await readJsonOrThrow(response)) as AssessmentSubmissionRead[]
      },
      enabled: Boolean(assessmentUuid),
    }),
  })

  const draft = draftQuery.data?.submission ?? null
  const submission = draft ?? submissionsQuery.data?.[0] ?? null
  const version = submission?.version
  const draftVersion = submission?.draft_version

  useEffect(() => {
    localAnswersRef.current = localAnswers
  }, [localAnswers])

  useEffect(() => {
    versionRef.current = version
  }, [version])

  useEffect(() => {
    draftVersionRef.current = draftVersion
  }, [draftVersion])

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
        next.sort((left, right) => {
          const leftTime = new Date(left.created_at ?? left.updated_at).getTime()
          const rightTime = new Date(right.created_at ?? right.updated_at).getTime()
          return rightTime - leftTime
        })
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
      if (!assessmentUuid) throw new Error('Assessment is not ready')
      const response = await apiFetch(`assessments/${assessmentUuid}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(draftVersionRef.current ? { 'If-Match': String(draftVersionRef.current) } : {}),
        },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([item_uuid, answer]) => ({
            item_uuid,
            answer,
          })),
        }),
      })
      return (await readJsonOrThrow(response)) as AssessmentSubmissionRead
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: async latest => {
      draftVersionRef.current = latest.draft_version
      versionRef.current = latest.version
      syncLatestSubmission(latest)
      setConflictState(null)
      setSaveState('saved')
      await invalidateAssessmentState()
    },
    onError: (error: Error & { status?: number; payload?: any }) => {
      if (error.status === 409) {
        const latest = error.payload?.detail?.latest as AssessmentSubmissionRead | undefined
        if (latest) {
          draftVersionRef.current = latest.draft_version
          versionRef.current = latest.version
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
      if (error.status === 429) {
        setSaveState('dirty')
        return
      }
      // Gentle offline recovery support
      if (!error.status || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        setSaveState('dirty')
        return
      }
      setSaveState('error')
      void reportClientError({
        scope: 'assessment-flow',
        phase: 'save-draft',
        assessmentUuid,
        error: error.message || 'Failed to save draft',
      }).catch(() => undefined)
      toast.error(error.message || 'Failed to save draft')
    },
  })

  const submitMutation = useMutation({
    mutationFn: async ({
      answers,
      violationCount,
      autoSubmit,
    }: {
      answers: Record<string, ItemAnswer>
      violationCount?: number
      autoSubmit?: boolean
    }) => {
      if (!assessmentUuid) throw new Error('Assessment is not ready')
      const params = new URLSearchParams()
      if (typeof violationCount === 'number' && violationCount > 0) {
        params.set('violation_count', String(violationCount))
      }
      if (autoSubmit) {
        params.set('auto_submit', 'true')
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : ''
      const response = await apiFetch(`assessments/${assessmentUuid}/submit${suffix}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(draftVersionRef.current ? { 'If-Match': String(draftVersionRef.current) } : {}),
        },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([item_uuid, answer]) => ({
            item_uuid,
            answer,
          })),
        }),
      })
      return (await readJsonOrThrow(response)) as AssessmentSubmissionRead
    },
    onSuccess: async latest => {
      draftVersionRef.current = latest.draft_version
      versionRef.current = latest.version
      syncLatestSubmission(latest)
      setConflictState(null)
      setSaveState('saved')
      if (assessmentUuid) {
        await invalidateAssessmentState()
      }
    },
    onError: (error: Error & { status?: number; payload?: any }) => {
      if (error.status === 409) {
        const latest = error.payload?.detail?.latest as AssessmentSubmissionRead | undefined
        if (latest) {
          draftVersionRef.current = latest.draft_version
          versionRef.current = latest.version
          openConflict(latest)
        }
        toast.error(t('answersUpdatedElsewhere'))
        return
      }
      setSaveState('error')
      if (error.status !== 429) {
        void reportClientError({
          scope: 'assessment-flow',
          phase: 'submit-assessment',
          assessmentUuid,
          error: error.message || 'Failed to submit assessment',
        }).catch(() => undefined)
      }
      toast.error(error.message || t('submitFailed'))
    },
  })

  useEffect(() => {
    const loadError = draftQuery.error ?? submissionsQuery.error
    if (!loadError) return
    const errorStatus = (loadError as any)?.status
    if (errorStatus === 429) return
    const { message } = loadError
    const key = `${assessmentUuid ?? 'missing'}:${message}`
    if (reportedLoadError === key) return
    setReportedLoadError(key)
    void reportClientError({
      scope: 'assessment-flow',
      phase: 'load-submission-state',
      assessmentUuid,
      error: message,
    }).catch(() => undefined)
  }, [assessmentUuid, draftQuery.error, reportedLoadError, submissionsQuery.error])

  useEffect(() => {
    if (!assessmentUuid) {
      setLocalAnswers({})
      setSaveState('idle')
      setConflictState(null)
      return
    }
    if (draftQuery.isLoading || submissionsQuery.isLoading) return
    if (saveState === 'dirty' || saveState === 'conflict' || saveMutation.isPending || submitMutation.isPending) return
    setLocalAnswers(answersFromSubmission(submission))
    if (saveState === 'idle' || saveState === 'saved') {
      setSaveState(submission ? 'saved' : 'idle')
    }
  }, [
    assessmentUuid,
    draftQuery.isLoading,
    submissionsQuery.isLoading,
    saveMutation.isPending,
    saveState,
    submission,
    submitMutation.isPending,
  ])

  const setItemAnswer = useCallback((itemUuid: string, answer: ItemAnswer) => {
    setLocalAnswers(current => ({ ...current, [itemUuid]: answer }))
    setSaveState('dirty')
  }, [])

  const keepLocalVersion = useCallback(() => {
    setConflictState(null)
    setSaveState('dirty')
  }, [])

  const useServerVersion = useCallback(() => {
    if (!conflictState) return
    setLocalAnswers(answersFromSubmission(conflictState.latest))
    setConflictState(null)
    setSaveState(conflictState.latest.status === 'DRAFT' ? 'saved' : 'idle')
  }, [conflictState])

  const { mutate: saveMutate, isPending: isSaving } = saveMutation
  const { mutateAsync: submitMutateAsync, isPending: isSubmitting } = submitMutation

  const save = useCallback(() => {
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
            save()
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
          save()
        }
      },
      onError: (error: any) => {
        if (error.status === 429) {
          lastSaveTimeRef.current = 0
          setSaveState('dirty')
          if (!nextSaveTimeoutRef.current) {
            nextSaveTimeoutRef.current = setTimeout(() => {
              nextSaveTimeoutRef.current = null
              save()
            }, 2000)
          }
        }
      },
    })
  }, [saveMutate, saveMutation.isPending])

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
      if (localAnswersRef.current && Object.keys(localAnswersRef.current).length > 0) {
        save()
      }
    }
    globalThis.addEventListener('online', handleOnline)
    return () => globalThis.removeEventListener('online', handleOnline)
  }, [save])

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
              latestVersion: conflictState.latest.draft_version ?? conflictState.latest.version,
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
  if (typeof structuredClone === 'function') {
    return structuredClone(answers)
  }
  // Fallback for environments without structuredClone (e.g. older Safari/Node)
  return structuredClone(answers)
}

function areAnswersEqual(left: Record<string, ItemAnswer>, right: Record<string, ItemAnswer>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
