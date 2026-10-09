import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarOff, ChartColumn, Lock, PanelLeft, Send, Settings2, UsersRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiJson } from '@/lib/api-client'
import { hasErrorCode, isApiError } from '@/lib/api/assertSuccess'
import { useApiError } from '@/hooks/useApiError'
import { itemBodyToWire } from '@/features/assessments/domain/assessment-wire'
import { toUnix } from '@/lib/api/contract'
import { courseKeys } from '@/hooks/courses/courseKeys'
import { queryKeys } from '@/lib/react-query/queryKeys'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { AssessmentWorkspaceNavItem } from '../workspace/AssessmentWorkspaceShell'
import {
  buildAssessmentPatch,
  getAssessmentEditorIssues,
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
    activeView,
    setActiveView,
    setSaveLedgerEntry,
    clearSaveLedgerEntry,
  } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const tStudio = useTranslations('Features.Assessments.Studio')
  const tTabs = useTranslations('Features.Assessments.Studio.Tabs')
  const { toastApiError } = useApiError()
  const displayItemNoun = itemNounKey ? t(`itemNouns.${itemNounKey}`) : itemNoun

  const [prevItems, setPrevItems] = useState(items)
  const [localOrderedUuids, setLocalOrderedUuids] = useState<string[]>(() => items.map(item => item.item_uuid))

  if (items !== prevItems) {
    setPrevItems(items)
    setLocalOrderedUuids(items.map(item => item.item_uuid))
  }

  const orderedItems = localOrderedUuids
    .map(uuid => items.find(item => item.item_uuid === uuid))
    .filter((item): item is AssessmentItem => Boolean(item))

  const item = orderedItems.find(candidate => candidate.item_uuid === selectedItemUuid) ?? orderedItems[0] ?? null

  const [prevAssessment, setPrevAssessment] = useState(assessment)
  const [assessmentState, setAssessmentState] = useState<AssessmentEditorState>(() =>
    toAssessmentEditorState(assessment),
  )
  const [itemState, setItemState] = useState<EditableItem | null>(item ? toEditableItem(item) : null)
  const [assessmentSaveState, setAssessmentSaveState] = useState<SaveState>('idle')
  const [itemSaveState, setItemSaveState] = useState<SaveState>('idle')
  const lastSavedAssessmentRef = useRef('')
  const lastSavedItemRef = useRef('')
  // What the in-flight autosave sent. The refetch after a save brings back
  // that state; anything typed since must survive it, not be replaced by it.
  const [sentAssessment, setSentAssessment] = useState<string | null>(null)
  const [sentItem, setSentItem] = useState<string | null>(null)

  if (assessment !== prevAssessment) {
    setPrevAssessment(assessment)
    if (sentAssessment === null || serializeAssessmentState(assessmentState) === sentAssessment) {
      setAssessmentState(toAssessmentEditorState(assessment))
      setAssessmentSaveState('idle')
    }
    setSentAssessment(null)
  }

  const [prevItemKey, setPrevItemKey] = useState(() => ({
    uuid: item?.item_uuid,
    updated_at: item?.updated_at,
    item,
  }))

  const hasItemChanged =
    item?.item_uuid !== prevItemKey.uuid || item?.updated_at !== prevItemKey.updated_at || item !== prevItemKey.item

  if (hasItemChanged) {
    setPrevItemKey({
      uuid: item?.item_uuid,
      updated_at: item?.updated_at,
      item,
    })
    const typedSinceSave =
      item?.item_uuid === prevItemKey.uuid &&
      sentItem !== null &&
      itemState !== null &&
      serializeItemState(itemState) !== sentItem
    if (!typedSinceSave) {
      setItemState(item ? toEditableItem(item) : null)
      setItemSaveState('idle')
    }
    setSentItem(null)
  }

  useEffect(() => {
    lastSavedAssessmentRef.current = serializeAssessmentState(toAssessmentEditorState(assessment))
  }, [assessment])

  // Per-field snapshot of the server's item: a save sends only the fields this tab changed, so a
  // co-author's (or another tab's) edit to a different field is not reverted by a stale copy.
  const savedItemFieldsRef = useRef<{ uuid: string; fields: Record<string, string> } | null>(null)

  useEffect(() => {
    const nextItem = item ? toEditableItem(item) : null
    lastSavedItemRef.current = nextItem ? serializeItemState(nextItem) : ''
    savedItemFieldsRef.current = nextItem ? { uuid: nextItem.item_uuid, fields: itemWireFields(nextItem) } : null
  }, [item])

  const saveAssessment = useCallback(
    async (nextState: AssessmentEditorState) => {
      setAssessmentSaveState('saving')
      setSentAssessment(serializeAssessmentState(nextState))
      try {
        const { details, policy } = buildAssessmentPatch(mode, assessment, nextState)
        await Promise.all([
          apiJson(`assessments/${assessment.assessment_uuid}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details),
          }),
          policy
            ? apiJson(`assessments/${assessment.assessment_uuid}/policy`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(policy),
              })
            : null,
        ])
        lastSavedAssessmentRef.current = serializeAssessmentState(nextState)
        setAssessmentSaveState('saved')
        await refresh()
      } catch (error) {
        setAssessmentSaveState('error')
        toastApiError(error, { fallback: t('failedToSaveSettings') })
      }
    },
    [assessment, mode, refresh, t, toastApiError],
  )

  const saveItem = useCallback(
    async (nextItem: EditableItem) => {
      setItemSaveState('saving')
      setSentItem(serializeItemState(nextItem))
      try {
        const fields = itemWireFields(nextItem)
        const saved = savedItemFieldsRef.current?.uuid === nextItem.item_uuid ? savedItemFieldsRef.current.fields : null
        const changed = Object.fromEntries(
          Object.entries(fields)
            .filter(([key, value]) => saved?.[key] !== value)
            .map(([key, value]) => [key, JSON.parse(value) as unknown]),
        )
        if (Object.keys(changed).length > 0) {
          await apiJson(`assessment-items/${nextItem.item_uuid}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changed),
          })
        }
        savedItemFieldsRef.current = { uuid: nextItem.item_uuid, fields }
        lastSavedItemRef.current = serializeItemState(nextItem)
        setItemSaveState('saved')
        await refresh()
      } catch (error) {
        setItemSaveState('error')
        toastApiError(error, { fallback: t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() }) })
      }
    },
    [displayItemNoun, refresh, t, toastApiError],
  )

  useEffect(() => {
    if (!isEditable) return
    const serialized = serializeAssessmentState(assessmentState)
    if (serialized === lastSavedAssessmentRef.current) return
    setAssessmentSaveState('dirty')
    // UX-120/UX-292: a blank title or an out-of-range policy value is flagged inline;
    // the server would only 422 it, so nothing is PATCHed until it is fixed.
    if (getAssessmentEditorIssues(mode, assessmentState, t).length > 0) return
    const timeout = setTimeout(() => {
      void saveAssessment(assessmentState)
    }, 900)
    return () => clearTimeout(timeout)
  }, [assessmentState, isEditable, mode, saveAssessment, t])

  useEffect(() => {
    if (!isEditable || !itemState) return
    const serialized = serializeItemState(itemState)
    if (serialized === lastSavedItemRef.current) return
    setItemSaveState('dirty')
    // UX-143 (UX-120 pattern): a blank item title is flagged inline
    // (`item.title_missing`); the server would only 422 it, so nothing is
    // PATCHed until it is back.
    if (!itemState.title.trim()) return
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
        await apiJson(`assessments/${assessment.assessment_uuid}/items/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: orderedUuids }),
        })
        await refresh()
      } catch (error) {
        setLocalOrderedUuids(previousOrder)
        toastApiError(error, { fallback: t('reorderFailed') })
        // UX-293: a refused move means this tab's list is stale - refetch it, or every later move 422s.
        await refresh()
      }
    },
    [assessment.assessment_uuid, localOrderedUuids, refresh, t, toastApiError],
  )

  const updateItemMetadata = useCallback(
    async (itemUuid: string, metadata: EditableItem['metadata']) => {
      try {
        await apiJson(`assessment-items/${itemUuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata }),
        })
        await refresh()
      } catch (error) {
        toastApiError(error, { fallback: t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() }) })
        throw error
      }
    },
    [displayItemNoun, refresh, t, toastApiError],
  )

  const queryClient = useQueryClient()
  const setLifecycle = useCallback(
    async (lifecycle: AssessmentLifecycle, scheduledAt?: string | null, auditNote?: string | null) => {
      try {
        await apiJson(`assessments/${assessment.assessment_uuid}/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: lifecycle.toLowerCase(),
            scheduled_at_unix: toUnix(scheduledAt),
            note: auditNote?.trim() || null,
          }),
        })
        // UX-200: the result shows as soon as the transition lands, not after the refetches.
        toast.success(tStudio('lifecycleChanged', { state: tStudio(`lifecycle.${lifecycle.toLowerCase()}`) }))
        await refresh()
        // The transition (un)publishes the activity: the learner-facing
        // outline, the curriculum and the course readiness verdict move (UX-085).
        if (assessment.course_uuid) {
          const courseUuid = assessment.course_uuid.replace(/^course_/, '')
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: courseKeys.structure(courseUuid).slice(0, 3) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.courses.readiness(courseUuid) }),
          ])
        }
      } catch (error) {
        // BUG-171: a 409 names the refused stage in the page language and re-syncs the view.
        if (hasErrorCode(error, 'conflict')) {
          await refresh()
          toast.error(tStudio('lifecycleConflict', { state: tStudio(`lifecycle.${lifecycle.toLowerCase()}`) }))
          return
        }
        // UX-128: `schedule.after_due_at` belongs on the date field - the
        // publish tab shows it there and keeps the picked date.
        if (isApiError(error) && error.fieldErrors.some(e => e.code === 'schedule.after_due_at')) throw error
        toastApiError(error, { fallback: tStudio('updateLifecycleFailed') })
      }
    },
    [assessment.assessment_uuid, assessment.course_uuid, queryClient, refresh, tStudio, toastApiError],
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

      {view === 'ACCESS' && (
        // Audience + accommodations are live-assessment policy (v2 gates
        // neither on lifecycle), not content: only an archived one is frozen.
        <AccessManagementTab
          assessmentUuid={assessment.assessment_uuid}
          courseUuid={assessment.course_uuid ?? null}
          disabled={assessment.lifecycle === 'ARCHIVED'}
        />
      )}

      {view === 'RESULTS' && (
        <ResultsReviewTab
          assessmentUuid={assessment.assessment_uuid}
          activityUuid={assessment.activity_uuid}
          courseUuid={assessment.course_uuid ?? null}
        />
      )}
    </>
  )

  // BUG-171: a scheduled assessment is read-only on the server - say so
  // instead of letting every autosave 409.
  const banner =
    assessment.lifecycle === 'SCHEDULED' ? (
      <Alert className="rounded-none border-x-0 border-t-0">
        <CalendarOff className="size-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{tStudio('scheduledReadOnly')}</span>
          <Button size="sm" variant="outline" onClick={() => void setLifecycle('DRAFT')}>
            {tStudio('unschedule')}
          </Button>
        </AlertDescription>
      </Alert>
    ) : assessment.lifecycle === 'PUBLISHED' || assessment.lifecycle === 'ARCHIVED' ? (
      // Every field below is disabled; say why and where the way back to editing is.
      <Alert className="rounded-none border-x-0 border-t-0">
        <Lock className="size-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{tStudio(assessment.lifecycle === 'PUBLISHED' ? 'publishedReadOnly' : 'archivedReadOnly')}</span>
          {activeView === 'PUBLISH' ? null : (
            <Button size="sm" variant="outline" onClick={() => setActiveView('PUBLISH')}>
              {tTabs('publish')}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    ) : null

  return <AssessmentWorkspaceShell navItems={navItems} banner={banner} renderView={view => renderView(view)} />
}

/** The PATCH fields of an item, each JSON-encoded for comparison. */
function itemWireFields(item: EditableItem): Record<string, string> {
  return {
    title: JSON.stringify(item.title),
    max_score: JSON.stringify(item.max_score),
    body: JSON.stringify(itemBodyToWire(item.body)),
    metadata: JSON.stringify(item.metadata),
  }
}
