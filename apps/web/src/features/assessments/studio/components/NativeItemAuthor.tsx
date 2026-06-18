import { useCallback, useEffect, useRef, useState } from 'react'
import { ChartColumn, PanelLeft, Send, Settings2, UsersRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import { useAssessmentStudioContext } from '../context'
import type { AssessmentItem } from '@/features/assessments/domain/items'
import {
  classifyValidationIssue,
  dedupeIssues,
  itemIssues as persistedItemIssues,
  localItemValidationIssues,
} from '@/features/assessments/domain/readiness'
import GeneralSettingsTab from '../tabs/GeneralSettingsTab'
import BuilderCanvasTab from '../tabs/BuilderCanvasTab'
import PublishDashboardTab from '../tabs/PublishDashboardTab'
import AccessManagementTab from '../tabs/AccessManagementTab'
import ResultsReviewTab from '../tabs/ResultsReviewTab'
import type { AssessmentEditorState, EditableItem, StudioTab } from '../studioTypes'
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge'
import { AssessmentWorkspaceShell } from '../workspace/AssessmentWorkspaceShell'
import type { AssessmentWorkspaceNavItem } from '../workspace/AssessmentWorkspaceShell'
import {
  buildAssessmentPatch,
  getAssessmentEditorIssues,
  responseError,
  serializeAssessmentState,
  serializeItemState,
  toAssessmentEditorState,
  toEditableItem,
} from '../utils'
import type { AssessmentLifecycle, StudioMode, SupportedStudioItemKind } from '../utils'
import { NativeItemBodyEditor } from './NativeItemBodyEditor'

interface NativeItemAuthorProps {
  mode: StudioMode
  itemNoun: string
  itemNounKey?: 'question' | 'task'
  allowedKinds?: SupportedStudioItemKind[]
}

const DEFAULT_ALLOWED_KINDS: SupportedStudioItemKind[] = ['CHOICE', 'MATCHING', 'OPEN_TEXT', 'FORM']

export function NativeItemAuthor({
  mode,
  itemNoun,
  itemNounKey,
  allowedKinds = DEFAULT_ALLOWED_KINDS,
}: NativeItemAuthorProps) {
  const {
    assessment,
    items,
    selectedItemUuid,
    setSelectedItemUuid,
    refresh,
    isEditable,
    totalPoints,
    validationIssues,
    setActiveView,
    setSaveLedgerEntry,
    clearSaveLedgerEntry,
  } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const tTabs = useTranslations('Features.Assessments.Studio.Tabs')
  const displayItemNoun = itemNounKey ? t(`itemNouns.${itemNounKey}`) : itemNoun

  const [localOrderedUuids, setLocalOrderedUuids] = useState<string[]>([])

  useEffect(() => {
    setLocalOrderedUuids(items.map(item => item.item_uuid))
  }, [items])

  const orderedItems = localOrderedUuids
    .map(uuid => items.find(item => item.item_uuid === uuid))
    .filter((item): item is AssessmentItem => Boolean(item))

  const item = orderedItems.find(candidate => candidate.item_uuid === selectedItemUuid) ?? orderedItems[0] ?? null

  const [assessmentState, setAssessmentState] = useState<AssessmentEditorState>(() =>
    toAssessmentEditorState(assessment),
  )
  const [itemState, setItemState] = useState<EditableItem | null>(item ? toEditableItem(item) : null)
  const [assessmentSaveState, setAssessmentSaveState] = useState<SaveState>('idle')
  const [itemSaveState, setItemSaveState] = useState<SaveState>('idle')
  const lastSavedAssessmentRef = useRef('')
  const lastSavedItemRef = useRef('')

  useEffect(() => {
    const nextAssessmentState = toAssessmentEditorState(assessment)
    setAssessmentState(nextAssessmentState)
    lastSavedAssessmentRef.current = serializeAssessmentState(nextAssessmentState)
    setAssessmentSaveState('idle')
  }, [assessment])

  useEffect(() => {
    const nextItem = item ? toEditableItem(item) : null
    setItemState(nextItem)
    lastSavedItemRef.current = nextItem ? serializeItemState(nextItem) : ''
    setItemSaveState('idle')
  }, [item?.item_uuid, item?.updated_at, item])

  const saveAssessment = useCallback(
    async (nextState: AssessmentEditorState) => {
      setAssessmentSaveState('saving')
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAssessmentPatch(mode, assessment, nextState)),
        })
        if (!response.ok) throw new Error(await responseError(response, 'Failed to save assessment settings'))
        lastSavedAssessmentRef.current = serializeAssessmentState(nextState)
        setAssessmentSaveState('saved')
        await refresh()
      } catch (error) {
        setAssessmentSaveState('error')
        toast.error(error instanceof Error ? error.message : t('failedToSaveSettings'))
      }
    },
    [assessment, mode, refresh, t],
  )

  const saveItem = useCallback(
    async (nextItem: EditableItem) => {
      setItemSaveState('saving')
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${nextItem.item_uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: nextItem.kind,
            title: nextItem.title,
            max_score: nextItem.max_score,
            body: nextItem.body,
            metadata: nextItem.metadata,
          }),
        })
        if (!response.ok) {
          throw new Error(
            await responseError(response, t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() })),
          )
        }
        lastSavedItemRef.current = serializeItemState(nextItem)
        setItemSaveState('saved')
        await refresh()
      } catch (error) {
        setItemSaveState('error')
        toast.error(
          error instanceof Error ? error.message : t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() }),
        )
      }
    },
    [assessment.assessment_uuid, displayItemNoun, refresh, t],
  )

  useEffect(() => {
    if (!isEditable) return
    const serialized = serializeAssessmentState(assessmentState)
    if (serialized === lastSavedAssessmentRef.current) return
    setAssessmentSaveState('dirty')
    const timeout = setTimeout(() => {
      void saveAssessment(assessmentState)
    }, 900)
    return () => clearTimeout(timeout)
  }, [assessmentState, isEditable, saveAssessment])

  useEffect(() => {
    if (!isEditable || !itemState) return
    const serialized = serializeItemState(itemState)
    if (serialized === lastSavedItemRef.current) return
    setItemSaveState('dirty')
    const timeout = setTimeout(() => {
      void saveItem(itemState)
    }, 900)
    return () => clearTimeout(timeout)
  }, [isEditable, itemState, saveItem])

  useEffect(() => {
    setSaveLedgerEntry({
      id: 'assessment',
      label: t('saveLedger.assessment'),
      state: assessmentSaveState,
      retry: () => void saveAssessment(assessmentState),
    })
    return () => clearSaveLedgerEntry('assessment')
  }, [assessmentSaveState, assessmentState, clearSaveLedgerEntry, saveAssessment, setSaveLedgerEntry, t])

  useEffect(() => {
    const retry = itemState ? () => void saveItem(itemState) : null
    setSaveLedgerEntry({
      id: 'item',
      label: t('saveLedger.item'),
      state: itemSaveState,
      ...(retry ? { retry } : {}),
    })
    return () => clearSaveLedgerEntry('item')
  }, [clearSaveLedgerEntry, itemSaveState, itemState, saveItem, setSaveLedgerEntry, t])

  const handleReorder = useCallback(
    async (orderedUuids: string[]) => {
      const previousOrder = localOrderedUuids
      setLocalOrderedUuids(orderedUuids)
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items:reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: orderedUuids.map((item_uuid, index) => ({
              item_uuid,
              order: index + 1,
            })),
          }),
        })
        if (!response.ok) throw new Error(await responseError(response, t('reorderFailed')))
        await refresh()
      } catch (error) {
        setLocalOrderedUuids(previousOrder)
        toast.error(error instanceof Error ? error.message : t('reorderFailed'))
      }
    },
    [assessment.assessment_uuid, localOrderedUuids, refresh, t],
  )

  const updateItemMetadata = useCallback(
    async (itemUuid: string, metadata: EditableItem['metadata']) => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${itemUuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata }),
        })
        if (!response.ok) {
          throw new Error(
            await responseError(response, t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() })),
          )
        }
        await refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() }),
        )
        throw error
      }
    },
    [assessment.assessment_uuid, displayItemNoun, refresh, t],
  )

  const setLifecycle = useCallback(
    async (lifecycle: AssessmentLifecycle, scheduledAt?: string | null, auditNote?: string | null) => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: lifecycle,
            scheduled_at: scheduledAt ?? null,
            audit_note: auditNote?.trim() || null,
          }),
        })
        if (!response.ok) throw new Error(await responseError(response, 'Failed to update lifecycle'))
        await refresh()
        toast.success(t('lifecycleChanged', { state: lifecycle }))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('updateLifecycleFailed'))
      }
    },
    [assessment.assessment_uuid, refresh, t],
  )

  const assessmentIssues = getAssessmentEditorIssues(mode, assessmentState, t).map(classifyValidationIssue)
  const itemIssueList = itemState
    ? dedupeIssues([
        ...localItemValidationIssues(itemState),
        ...persistedItemIssues(validationIssues, itemState.item_uuid),
      ]).map(classifyValidationIssue)
    : []
  const itemContentIssues = itemIssueList.filter(issue => issue.area === 'item-content' || issue.area === 'item-kind')
  const allIssues = dedupeIssues([...validationIssues, ...assessmentIssues])

  const navItems: AssessmentWorkspaceNavItem[] = [
    { id: 'SETUP', label: tTabs('setup'), icon: Settings2 },
    {
      id: 'BUILDER',
      label: tTabs('builder'),
      icon: PanelLeft,
      issueCount: itemIssueList.length,
    },
    { id: 'ACCESS', label: tTabs('access'), icon: UsersRound },
    { id: 'RESULTS', label: tTabs('results'), icon: ChartColumn },
    {
      id: 'PUBLISH',
      label: tTabs('publish'),
      icon: Send,
      issueCount: allIssues.length,
    },
  ]

  const renderView = (view: StudioTab) => (
    <>
      {view === 'SETUP' && (
        <GeneralSettingsTab
          state={assessmentState}
          saveState={assessmentSaveState}
          disabled={!isEditable}
          issues={assessmentIssues}
          onChange={setAssessmentState}
        />
      )}

      {view === 'BUILDER' && (
        <BuilderCanvasTab
          assessmentUuid={assessment.assessment_uuid}
          items={orderedItems}
          selectedItemUuid={selectedItemUuid}
          allowedKinds={allowedKinds}
          itemNoun={displayItemNoun}
          isEditable={isEditable}
          validationIssues={validationIssues}
          totalPoints={totalPoints}
          itemState={itemState}
          itemSaveState={itemSaveState}
          onSelectItem={setSelectedItemUuid}
          onItemCreated={async uuid => {
            await refresh()
            setSelectedItemUuid(uuid)
          }}
          onItemDeleted={async () => {
            setSelectedItemUuid(null)
            await refresh()
          }}
          onItemDuplicated={async uuid => {
            await refresh()
            setSelectedItemUuid(uuid)
          }}
          onReorder={handleReorder}
          onItemMetadataChange={updateItemMetadata}
          onItemChange={setItemState}
          renderItemBodyEditor={currentItem => (
            <NativeItemBodyEditor
              item={currentItem}
              disabled={!isEditable}
              issues={itemContentIssues}
              onChange={setItemState}
            />
          )}
        />
      )}

      {view === 'PUBLISH' && (
        <PublishDashboardTab
          assessmentUuid={assessment.assessment_uuid}
          lifecycle={assessment.lifecycle}
          items={orderedItems}
          totalPoints={totalPoints}
          assessmentState={assessmentState}
          validationIssues={allIssues}
          canPublish={items.length > 0 && allIssues.length === 0}
          canSchedule={assessment.lifecycle !== 'ARCHIVED'}
          canArchive={assessment.lifecycle !== 'ARCHIVED'}
          scheduledAt={assessment.scheduled_at ?? null}
          publishedAt={assessment.published_at ?? null}
          archivedAt={assessment.archived_at ?? null}
          onSwitchToBuilder={itemUuid => {
            setActiveView('BUILDER')
            if (itemUuid) setSelectedItemUuid(itemUuid)
          }}
          onLifecycleChange={setLifecycle}
        />
      )}

      {view === 'ACCESS' && <AccessManagementTab assessmentUuid={assessment.assessment_uuid} disabled={!isEditable} />}

      {view === 'RESULTS' && (
        <ResultsReviewTab
          assessmentUuid={assessment.assessment_uuid}
          activityUuid={assessment.activity_uuid}
          courseUuid={assessment.course_uuid ?? null}
        />
      )}
    </>
  )

  return <AssessmentWorkspaceShell navItems={navItems} renderView={view => renderView(view)} />
}
