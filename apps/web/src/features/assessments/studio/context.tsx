import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { apiFetcher } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type { KindAuthorProps } from '@/features/assessments/registry'
import type { AssessmentItem } from '@/features/assessments/domain/items'
import { isAssessmentEditable } from '@/features/assessments/domain/lifecycle'
import type { ValidationIssue } from '@/features/assessments/domain/view-models'
import ErrorUI from '@/components/Objects/Elements/Error/Error'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import type { AssessmentStudioDetail, StudioReadinessPayload } from './utils'
import { toWorkspaceReadinessIssues } from './utils'
import type { AssessmentWorkspaceView, WorkspaceReadinessIssue } from './studioTypes'
import type { SaveLedgerEntry, SaveLedgerSummary } from './workspace/saveLedger'
import { summarizeSaveLedger } from './workspace/saveLedger'
import { readAssessmentWorkspaceUrlState, writeAssessmentWorkspaceUrlState } from './workspace/urlState'

export interface AssessmentStudioContextValue {
  activityUuid: string
  assessment: AssessmentStudioDetail
  items: AssessmentItem[]
  activeView: AssessmentWorkspaceView
  setActiveView: (view: AssessmentWorkspaceView) => void
  selectedItemUuid: string | null
  setSelectedItemUuid: (uuid: string | null) => void
  selectedIssueCode: string | null
  setSelectedIssueCode: (code: string | null) => void
  refresh: () => Promise<void>
  isEditable: boolean
  totalPoints: number
  validationIssues: ValidationIssue[]
  readinessIssues: WorkspaceReadinessIssue[]
  saveLedger: SaveLedgerSummary
  setSaveLedgerEntry: (entry: Omit<SaveLedgerEntry, 'updatedAt'>) => void
  clearSaveLedgerEntry: (id: string) => void
}

const AssessmentStudioContext = createContext<AssessmentStudioContextValue | null>(null)

export function AssessmentWorkspaceProvider({ activityUuid, children }: KindAuthorProps & { children: ReactNode }) {
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '')
  const queryClient = useQueryClient()
  const {
    data: assessment,
    isLoading,
    error,
  } = useQuery(
    queryOptions({
      queryKey: queryKeys.assessments.activity(normalizedActivityUuid),
      queryFn: () => apiFetcher<AssessmentStudioDetail>(`assessments/activity/${normalizedActivityUuid}`),
      enabled: Boolean(normalizedActivityUuid),
    }),
  )

  const [activeView, setActiveViewState] = useState<AssessmentWorkspaceView>(() => {
    if (typeof globalThis.window === 'undefined') return 'BUILDER'
    return readAssessmentWorkspaceUrlState(globalThis.location.search).view
  })
  const [selectedItemUuid, setSelectedItemUuidState] = useState<string | null>(() => {
    if (typeof globalThis.window === 'undefined') return null
    return readAssessmentWorkspaceUrlState(globalThis.location.search).selectedItemUuid
  })
  const [selectedIssueCode, setSelectedIssueCodeState] = useState<string | null>(() => {
    if (typeof globalThis.window === 'undefined') return null
    return readAssessmentWorkspaceUrlState(globalThis.location.search).selectedIssueCode
  })
  const [saveLedgerEntries, setSaveLedgerEntries] = useState<SaveLedgerEntry[]>([])

  const readinessQuery = useQuery(
    queryOptions({
      queryKey: queryKeys.assessments.readiness(assessment?.assessment_uuid ?? ''),
      queryFn: () => apiFetcher<StudioReadinessPayload>(`assessments/${assessment?.assessment_uuid}/readiness`),
      enabled: Boolean(assessment?.assessment_uuid),
      retry: false,
    }),
  )

  useEffect(() => {
    if (!assessment?.items?.length) {
      setSelectedItemUuidState(null)
      return
    }

    if (!selectedItemUuid || !assessment.items.some(item => item.item_uuid === selectedItemUuid)) {
      setSelectedItemUuidState(assessment.items[0]?.item_uuid ?? null)
    }
  }, [assessment?.items, selectedItemUuid])

  const replaceUrlState = useCallback((patch: Parameters<typeof writeAssessmentWorkspaceUrlState>[1]) => {
    if (typeof globalThis.window === 'undefined') return
    const nextUrl = writeAssessmentWorkspaceUrlState(globalThis.location.href, patch)
    globalThis.history.replaceState(null, '', nextUrl)
  }, [])

  const setActiveView = useCallback(
    (view: AssessmentWorkspaceView) => {
      setActiveViewState(view)
      replaceUrlState({ view })
    },
    [replaceUrlState],
  )

  const setSelectedItemUuid = useCallback(
    (uuid: string | null) => {
      setSelectedItemUuidState(uuid)
      replaceUrlState({ selectedItemUuid: uuid })
    },
    [replaceUrlState],
  )

  const setSelectedIssueCode = useCallback(
    (code: string | null) => {
      setSelectedIssueCodeState(code)
      replaceUrlState({ selectedIssueCode: code })
    },
    [replaceUrlState],
  )

  const refresh = useCallback(async () => {
    if (!assessment) return
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.activity(normalizedActivityUuid),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.detail(assessment.assessment_uuid),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.readiness(assessment.assessment_uuid),
      }),
    ])
  }, [assessment, normalizedActivityUuid, queryClient])

  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')

  const items = useMemo(() => {
    if (!assessment) return []
    return Array.isArray(assessment.items) ? assessment.items : []
  }, [assessment])

  const totalPoints = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.max_score || 0), 0)
  }, [items])

  const isEditable = assessment ? isAssessmentEditable(assessment.lifecycle) : false

  const validationIssues = useMemo(() => {
    if (!readinessQuery.data?.issues) return []
    return readinessQuery.data.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      ...(issue.item_uuid ? { itemUuid: issue.item_uuid } : {}),
      ...(issue.field ? { field: issue.field } : {}),
      ...(issue.action_label ? { actionLabel: issue.action_label } : {}),
    }))
  }, [readinessQuery.data?.issues])

  const readinessIssues = useMemo(() => toWorkspaceReadinessIssues(readinessQuery.data), [readinessQuery.data])

  const saveLedger = useMemo(() => summarizeSaveLedger(saveLedgerEntries), [saveLedgerEntries])

  const setSaveLedgerEntry = useCallback((entry: Omit<SaveLedgerEntry, 'updatedAt'>) => {
    setSaveLedgerEntries(current => {
      const nextEntry: SaveLedgerEntry = { ...entry, updatedAt: Date.now() }
      const withoutCurrent = current.filter(candidate => candidate.id !== entry.id)
      return [...withoutCurrent, nextEntry]
    })
  }, [])

  const clearSaveLedgerEntry = useCallback((id: string) => {
    setSaveLedgerEntries(current => current.filter(entry => entry.id !== id))
  }, [])

  useEffect(() => {
    if (!saveLedger.hasBlockingSaveState) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    globalThis.addEventListener('beforeunload', handleBeforeUnload)
    return () => globalThis.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveLedger.hasBlockingSaveState])

  const studioContextValue = useMemo<AssessmentStudioContextValue | null>(() => {
    if (!assessment) return null
    return {
      activityUuid: normalizedActivityUuid,
      assessment,
      items,
      activeView,
      setActiveView,
      selectedItemUuid,
      setSelectedItemUuid,
      selectedIssueCode,
      setSelectedIssueCode,
      refresh,
      isEditable,
      totalPoints,
      validationIssues,
      readinessIssues,
      saveLedger,
      setSaveLedgerEntry,
      clearSaveLedgerEntry,
    }
  }, [
    normalizedActivityUuid,
    assessment,
    items,
    activeView,
    setActiveView,
    selectedItemUuid,
    setSelectedItemUuid,
    selectedIssueCode,
    setSelectedIssueCode,
    refresh,
    isEditable,
    totalPoints,
    validationIssues,
    readinessIssues,
    saveLedger,
    setSaveLedgerEntry,
    clearSaveLedgerEntry,
  ])

  if (error) return <ErrorUI message={t('errorLoading')} />
  if (isLoading || !assessment) return <PageLoading />

  return <AssessmentStudioContext.Provider value={studioContextValue}>{children}</AssessmentStudioContext.Provider>
}

export function NativeItemStudioProvider(props: KindAuthorProps & { children: ReactNode }) {
  return <AssessmentWorkspaceProvider {...props} />
}

export function useAssessmentStudioContext() {
  const context = useContext(AssessmentStudioContext)
  if (!context) {
    throw new Error('useAssessmentStudioContext must be used inside NativeItemStudioProvider')
  }
  return context
}
