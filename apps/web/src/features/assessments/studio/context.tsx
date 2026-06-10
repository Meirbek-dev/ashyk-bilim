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

export interface AssessmentStudioContextValue {
  activityUuid: string
  assessment: AssessmentStudioDetail
  items: AssessmentItem[]
  selectedItemUuid: string | null
  setSelectedItemUuid: (uuid: string | null) => void
  refresh: () => Promise<void>
  isEditable: boolean
  totalPoints: number
  validationIssues: ValidationIssue[]
}

const AssessmentStudioContext = createContext<AssessmentStudioContextValue | null>(null)

export function NativeItemStudioProvider({ activityUuid, children }: KindAuthorProps & { children: ReactNode }) {
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

  const [selectedItemUuid, setSelectedItemUuid] = useState<string | null>(null)
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
      setSelectedItemUuid(null)
      return
    }

    if (!selectedItemUuid || !assessment.items.some(item => item.item_uuid === selectedItemUuid)) {
      setSelectedItemUuid(assessment.items[0]?.item_uuid ?? null)
    }
  }, [assessment?.items, selectedItemUuid])

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
    return readinessQuery.data.issues.map((issue: { code: string; message: string; item_uuid?: string | null }) => ({
      code: issue.code,
      message: issue.message,
      ...(issue.item_uuid ? { itemUuid: issue.item_uuid } : {}),
    }))
  }, [readinessQuery.data?.issues])

  const studioContextValue = useMemo<AssessmentStudioContextValue | null>(() => {
    if (!assessment) return null
    return {
      activityUuid: normalizedActivityUuid,
      assessment,
      items,
      selectedItemUuid,
      setSelectedItemUuid,
      refresh,
      isEditable,
      totalPoints,
      validationIssues,
    }
  }, [normalizedActivityUuid, assessment, items, selectedItemUuid, refresh, isEditable, totalPoints, validationIssues])

  if (error) return <ErrorUI message={t('errorLoading')} />
  if (isLoading || !assessment) return <PageLoading />

  return <AssessmentStudioContext.Provider value={studioContextValue}>{children}</AssessmentStudioContext.Provider>
}

export function useAssessmentStudioContext() {
  const context = useContext(AssessmentStudioContext)
  if (!context) {
    throw new Error('useAssessmentStudioContext must be used inside NativeItemStudioProvider')
  }
  return context
}
