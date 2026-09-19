'use client'

import {
  AlertTriangle,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Keyboard,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useFormatter, useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  canReturnSubmission,
  canSaveGradeDraft,
  canTeacherEditGrade,
  getReleaseState,
  isScoreInputInvalid,
  localizeItemFeedback,
  sumScores,
  toItemScale,
} from '@/features/grading/domain'
import type { GradedItem, GradingBreakdown, Submission, TeacherGradeInput } from '@/features/grading/domain'
import { StaleGradeError } from '@/services/grading/errors'
import { saveGradingDraft } from '@/services/assessments/assessment-actions'
import type { ItemGradeEntry } from '@/services/assessments/assessment-actions'
import { useGradingPanel } from '@/hooks/useGradingPanel'
import { assessmentByActivityQueryOptions } from '@/features/assessments/queries'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { formatAnnotationsAsFeedback, useAnnotations } from '../AnnotationContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MarkdownEditor } from '@/features/content-markdown'
import { SubmissionAIEntry } from '@/features/submission-analysis'
import type { ReviewNavigationState } from '../types'
import { readLocalStorageString, writeLocalStorageString } from '@/lib/local-storage'

interface GradeDraft {
  score: string
  feedback: string
}

interface ItemDraftEntry {
  score: string
  feedback: string
}

export default function GradeForm({
  submissionUuid,
  assessmentUuid,
  activityUuid,
  onSaved,
  navigation,
}: {
  submissionUuid: string | null
  assessmentUuid?: string
  activityUuid?: string
  onSaved: () => Promise<void>
  navigation: ReviewNavigationState
}) {
  const { submission, isLoading, mutate } = useGradingPanel(submissionUuid, assessmentUuid)
  const queryClient = useQueryClient()
  const { annotationsByItem, clearAll: clearAnnotations } = useAnnotations()
  const t = useTranslations('Grading.Panel')
  const tItemGrading = useTranslations('ItemGrading')
  const tGrading = useTranslations('Features.Grading')
  const format = useFormatter()
  const [draft, setDraft] = useState<GradeDraft>({ score: '', feedback: '' })
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraftEntry>>({})
  const [overrideScore, setOverrideScore] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [isSaving, startSaving] = useTransition()
  // BUG-123: an unsaved edit must survive a `grade.saved` refetch from a
  // colleague (and a 412 on our own save) — the server copy is offered in a
  // notice instead of silently replacing the drafts.
  const [dirty, setDirty] = useState(false)
  // BUG-174: only edited items (and a typed score) go to the server — re-sending
  // every stored item would recompute the raw over a manual override.
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(() => new Set())
  const [scoreDirty, setScoreDirty] = useState(false)
  const [remoteUpdate, setRemoteUpdate] = useState(false)
  // UX-049: `If-Match` carries the version the drafts were based on, not the
  // latest refetch — a colleague's save is adopted only by an explicit choice.
  const [baseVersion, setBaseVersion] = useState<number | null>(null)

  // Items from grading breakdown — may be empty for manual-only assessments.
  // An auto-grader verdict (`feedback_code`) is shown localized, read-only;
  // the editor holds teacher prose only (empty until the teacher writes,
  // which is what keeps the code on the server).
  const gradedItems: GradedItem[] = useMemo(() => {
    return (submission?.grading_json?.items ?? []).map(item => ({
      ...item,
      feedback: item.feedback_code ? '' : item.feedback,
    }))
  }, [submission?.grading_json?.items])
  const verdictByItem = useMemo(
    () =>
      new Map(
        (submission?.grading_json?.items ?? [])
          .filter(item => item.feedback_code)
          .map(item => [item.item_id, localizeItemFeedback(item, tGrading)]),
      ),
    [submission?.grading_json?.items, tGrading],
  )

  const hasItemGrading = gradedItems.length > 0 && Boolean(assessmentUuid)
  // The item definitions carry the scale the grade save expects (already
  // cached by the inspector, which renders the same assessment).
  const { data: assessment } = useQuery({
    ...assessmentByActivityQueryOptions(activityUuid ?? ''),
    enabled: Boolean(activityUuid) && hasItemGrading,
  })
  const itemScaleById = useMemo(
    () => new Map((assessment?.items ?? []).map(item => [item.id, item.max_score])),
    [assessment],
  )
  const scaleReady = !hasItemGrading || Boolean(assessment)

  // Calculated total from item drafts (0 to sum of max_scores)
  const calculatedTotal = useMemo(() => {
    if (!hasItemGrading) return null
    return sumScores(
      gradedItems.map(item => {
        const val = Number.parseFloat(itemDrafts[item.item_id]?.score ?? String(item.score))
        return Number.isNaN(val) ? 0 : Math.min(val, item.max_score)
      }),
    )
  }, [hasItemGrading, gradedItems, itemDrafts])

  const maxPossible = useMemo(() => sumScores(gradedItems.map(item => item.max_score)), [gradedItems])

  const editable = submission ? canTeacherEditGrade(submission.status) : false
  // UX-117: an integrity-annulled attempt keeps its raw 0 on the server unless
  // a typed override replaces it — the switch stays on, turning it off is a no-op.
  const annulled = submission?.auto_submit_reason === 'integrity_violation'
  // Field-level validation: a typed score outside 0..=max blocks save/publish
  // with a visible error instead of being silently clamped.
  const finalScoreInvalid = (!hasItemGrading || overrideScore) && isScoreInputInvalid(draft.score)
  const invalidItemIds = useMemo(
    () =>
      new Set(
        gradedItems
          .filter(item => isScoreInputInvalid(itemDrafts[item.item_id]?.score ?? '', item.max_score))
          .map(item => item.item_id),
      ),
    [gradedItems, itemDrafts],
  )
  const hasInvalidScore = finalScoreInvalid || invalidItemIds.size > 0

  const syncTrigger = `${submission?.submission_uuid ?? ''}-${submission?.version ?? ''}-${submission?.final_score ?? ''}-${submission?.score_override ?? ''}-${submission?.grading_json ? JSON.stringify(submission.grading_json) : ''}`
  const [lastSeed, setLastSeed] = useState({ uuid: '', trigger: '' })

  const seedDrafts = () => {
    const stored = submission?.score_override ?? submission?.final_score
    setDraft({
      score: stored === null || stored === undefined ? '' : String(stored),
      feedback: submission?.grading_json?.feedback ?? '',
    })
    setOverrideScore(submission?.score_override != null || submission?.auto_submit_reason === 'integrity_violation')
    setOverrideReason('')
    setDirty(false)
    setDirtyItems(new Set())
    setScoreDirty(false)
    setRemoteUpdate(false)
    setBaseVersion(submission?.version ?? null)

    if (submission?.grading_json?.items) {
      const next: Record<string, ItemDraftEntry> = {}
      for (const item of gradedItems) {
        next[item.item_id] = {
          score: String(item.score),
          feedback: item.feedback ?? '',
        }
      }
      setItemDrafts(next)
    } else {
      setItemDrafts({})
    }
  }

  if (syncTrigger !== lastSeed.trigger) {
    const uuid = submission?.submission_uuid ?? ''
    const fromColleague = dirty && uuid !== '' && uuid === lastSeed.uuid
    setLastSeed({ uuid, trigger: syncTrigger })
    if (fromColleague) setRemoteUpdate(true)
    else seedDrafts()
  }

  const editDraft = (patch: Partial<GradeDraft>) => {
    setDraft(current => ({ ...current, ...patch }))
    setDirty(true)
    if (patch.score !== undefined) setScoreDirty(true)
  }

  const patchItemDraft = (itemId: string, field: keyof ItemDraftEntry, value: string) => {
    setDirty(true)
    setDirtyItems(prev => new Set(prev).add(itemId))
    setItemDrafts(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        score: prev[itemId]?.score ?? '0',
        feedback: prev[itemId]?.feedback ?? '',
        [field]: value,
      },
    }))
  }

  // New item-level save (via unified assessment API)
  const saveWithItemGrading = useCallback(
    (status: 'save' | 'publish' | 'return') => {
      if (!submission || !assessmentUuid || !scaleReady || remoteUpdate) return
      if (hasInvalidScore) {
        toast.error(t('invalidScore'))
        return
      }

      const edited = (itemId: string) => dirtyItems.has(itemId) || (annotationsByItem[itemId]?.length ?? 0) > 0
      const itemGrades: ItemGradeEntry[] = gradedItems
        .filter(item => edited(item.item_id))
        .map(item => {
          const entry = itemDrafts[item.item_id]
          const rawScore = entry?.score ?? String(item.score)
          const parsed = Number.parseFloat(rawScore)
          const baseFeedback = entry?.feedback ?? item.feedback ?? ''
          const annotationNote = formatAnnotationsAsFeedback(annotationsByItem[item.item_id] ?? [])
          return {
            item_uuid: item.item_id,
            score: toItemScale(
              Number.isNaN(parsed) ? 0 : Math.min(parsed, item.max_score),
              item.max_score,
              itemScaleById.get(item.item_id),
            ),
            feedback: annotationNote ? baseFeedback + annotationNote : baseFeedback,
            is_manual: true,
          }
        })

      // Override on → the typed raw; switched off over a stored override →
      // an explicit null (the items decide again); untouched → omitted, the
      // server keeps what it has. Without items the typed score is the raw.
      const typedScore = overrideScore || (!hasItemGrading && scoreDirty)
      const finalScore: number | null | undefined = typedScore
        ? Number.parseFloat(draft.score)
        : submission.score_override != null
          ? null
          : undefined
      if (typedScore && (Number.isNaN(finalScore!) || finalScore! < 0 || finalScore! > 100)) {
        toast.error(t('invalidScore'))
        return
      }

      const detailQueryKey = queryKeys.grading.detail(submission.submission_uuid, assessmentUuid)
      const previousSubmission = queryClient.getQueryData<Submission>(detailQueryKey)
      const optimisticSubmission = buildOptimisticSubmission(submission, {
        assessmentUuid,
        calculatedTotal,
        draft,
        gradedItems,
        itemDrafts,
        overrideReason,
        status,
        itemGrades,
        finalScore: typedScore ? (finalScore ?? null) : null,
        // The reseed after a save reads `score_override` — keep it in step with what we sent.
        scoreOverride: overrideScore ? (finalScore ?? null) : finalScore === null ? null : (submission.score_override ?? null),
      })

      setDirty(false)
      queryClient.setQueryData(detailQueryKey, optimisticSubmission)

      startSaving(async () => {
        try {
          await saveGradingDraft(
            assessmentUuid,
            submission.submission_uuid,
            {
              item_grades: itemGrades,
              overall_feedback: draft.feedback,
              status,
              ...(finalScore === undefined ? {} : { final_score: finalScore }),
              ...(overrideScore && overrideReason ? { override_reason: overrideReason } : {}),
            },
            baseVersion ?? submission.version,
          )
          setRemoteUpdate(false)
          toast.success(
            status === 'publish'
              ? tItemGrading('toasts.published')
              : status === 'return'
                ? tItemGrading('toasts.returned')
                : tItemGrading('toasts.saved'),
          )
          clearAnnotations()
          await Promise.all([mutate(), onSaved()])
        } catch (error) {
          if (previousSubmission) {
            queryClient.setQueryData(detailQueryKey, previousSubmission)
          }
          if (error instanceof StaleGradeError) {
            // Keep what was typed; the refetch below raises the colleague notice.
            setDirty(true)
            await mutate()
          } else {
            toast.error(tItemGrading('toasts.failed'))
          }
        }
      })
    },
    [
      submission,
      assessmentUuid,
      gradedItems,
      hasInvalidScore,
      hasItemGrading,
      itemDrafts,
      dirtyItems,
      scoreDirty,
      overrideScore,
      draft,
      t,
      startSaving,
      overrideReason,
      tItemGrading,
      onSaved,
      mutate,
      annotationsByItem,
      clearAnnotations,
      calculatedTotal,
      queryClient,
      itemScaleById,
      scaleReady,
      remoteUpdate,
      baseVersion,
    ],
  )

  // All grading now goes through the item-level GradingDraftSave endpoint.
  // The legacy overall-score-only path has been removed.
  const saveOverallScore = useCallback(
    (status: TeacherGradeInput['status']) => {
      // Redirect to item-level grading with a single "overall" item
      saveWithItemGrading(status === 'PUBLISHED' ? 'publish' : status === 'RETURNED' ? 'return' : 'save')
    },
    [saveWithItemGrading],
  )

  // Ctrl+Enter saves draft; Ctrl+Shift+Enter publishes
  const handleCtrlEnter = useCallback(
    (event: KeyboardEvent) => {
      if (!editable || isSaving || hasInvalidScore || !scaleReady || remoteUpdate) return
      const isCtrl = event.ctrlKey || event.metaKey
      if (!isCtrl || event.key !== 'Enter') return
      event.preventDefault()
      if (hasItemGrading) {
        saveWithItemGrading(event.shiftKey ? 'publish' : 'save')
      } else {
        saveOverallScore(event.shiftKey ? 'PUBLISHED' : 'GRADED')
      }
    },
    [
      editable,
      isSaving,
      hasInvalidScore,
      hasItemGrading,
      saveWithItemGrading,
      saveOverallScore,
      scaleReady,
      remoteUpdate,
    ],
  )

  useEffect(() => {
    globalThis.addEventListener('keydown', handleCtrlEnter)
    return () => globalThis.removeEventListener('keydown', handleCtrlEnter)
  }, [handleCtrlEnter])

  if (!submissionUuid) {
    return <aside className="text-muted-foreground p-4 text-sm">{t('selectSubmission')}</aside>
  }

  if (isLoading && !submission) {
    return (
      <aside className="text-muted-foreground flex items-center justify-center p-4 text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loadingSubmission')}
      </aside>
    )
  }

  if (!submission) {
    return <aside className="text-muted-foreground p-4 text-sm">{t('formUnavailable')}</aside>
  }

  // UX-047: publish follows the form, not the stored status — every item (or
  // the final score) must carry a valid score; the server allows the publish
  // transition from PENDING/GRADED/RETURNED/PUBLISHED alike.
  const formScored = hasItemGrading
    ? gradedItems.every(item => (itemDrafts[item.item_id]?.score ?? '').trim() !== '')
    : draft.score.trim() !== ''
  const canPublishNow = editable && formScored && !hasInvalidScore
  const canReturnNow = canReturnSubmission(submission.status)
  const canSaveDraftNow = canSaveGradeDraft(submission.status)
  const isRepublish = submission.status === 'PUBLISHED'
  const actionHint = remoteUpdate
    ? t('staleDraftBlocked')
    : isRepublish
      ? t('republishHint')
      : canPublishNow
        ? null
        : t('publishPrerequisite')
  const releaseState =
    'release_state' in submission && submission.release_state
      ? submission.release_state
      : getReleaseState(submission.status)

  return (
    <aside className="space-y-5 p-4 xl:sticky xl:top-0 xl:h-[calc(100vh-96px)] xl:overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('grade')}</h2>
          <KeyboardHint />
        </div>
        <p className="text-muted-foreground text-sm">{t('gradeDescription')}</p>
      </div>

      {/* UX-067: a standing state, not an alert — no live-region announcement on every render. */}
      <Alert role="note">
        <Info className="size-4" />
        <AlertTitle>
          {releaseState === 'HIDDEN'
            ? t('releaseStateHidden')
            : releaseState === 'AWAITING_RELEASE'
              ? t('releaseStateAwaitingRelease')
              : releaseState === 'VISIBLE'
                ? t('releaseStateVisible')
                : t('releaseStateReturned')}
        </AlertTitle>
      </Alert>

      {/* ── Colleague saved meanwhile (SSE refetch or 412) ─────────────── */}
      {remoteUpdate ? (
        <Alert
          role="status"
          className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('staleDraftTitle')}</AlertTitle>
          <AlertDescription className="mt-1 space-y-1 text-xs">
            <p>
              {t('staleDraft.serverScoreLabel')}{' '}
              <strong>
                {submission.final_score != null ? format.number(submission.final_score, { maximumFractionDigits: 2 }) : '—'}
              </strong>
              . {t('staleDraft.yourDraftLabel')}{' '}
              <strong>
                {calculatedTotal !== null ? format.number(calculatedTotal, { maximumFractionDigits: 2 }) : draft.score}
              </strong>
              .
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={seedDrafts}>
                {t('useServerValues')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => {
                  setBaseVersion(submission.version ?? null)
                  setRemoteUpdate(false)
                }}
              >
                {t('keepMyDraft')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!navigation.hasPrevious} onClick={navigation.goPrevious}>
          <ChevronLeft className="size-4" />
          {t('previous')}
        </Button>
        <Button variant="outline" size="sm" disabled={!navigation.hasNext} onClick={navigation.goNext}>
          {t('next')}
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* ── Item-level grading ─────────────────────────────────────────── */}
      {hasItemGrading ? (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{tItemGrading('title')}</p>
            {calculatedTotal !== null && (
              <span className="text-muted-foreground text-xs">
                {tItemGrading('scoreSummary', {
                  earned: format.number(calculatedTotal, { maximumFractionDigits: 2 }),
                  possible: format.number(maxPossible, { maximumFractionDigits: 2 }),
                  percentage: maxPossible > 0 ? Math.round((calculatedTotal / maxPossible) * 100) : 0,
                })}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {gradedItems.map((item, idx) => {
              const entry = itemDrafts[item.item_id]
              return (
                <div key={item.item_id} className="bg-muted/30 space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">
                    {idx + 1}. {item.item_text || item.item_id}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={item.max_score}
                      step={0.5}
                      value={entry?.score ?? String(item.score)}
                      disabled={!editable || isSaving}
                      aria-label={`${idx + 1}. ${item.item_text || item.item_id}`}
                      aria-invalid={invalidItemIds.has(item.item_id) || undefined}
                      aria-describedby={
                        invalidItemIds.has(item.item_id) ? `item-score-error-${item.item_id}` : undefined
                      }
                      className="w-20"
                      onChange={e => patchItemDraft(item.item_id, 'score', e.target.value)}
                    />
                    {/* Inputs are on the breakdown scale (the item's share of the 100-point total), not the author's item points. */}
                    <span className="text-muted-foreground text-xs">
                      / {format.number(item.max_score)} · {tItemGrading('shareOfTotal')}
                    </span>
                    {item.needs_manual_review && (
                      <span className="ml-auto text-xs text-amber-600">{t('needsReview')}</span>
                    )}
                  </div>
                  {verdictByItem.has(item.item_id) ? (
                    <p className="text-muted-foreground text-xs" data-testid={`item-verdict-${item.item_id}`}>
                      {verdictByItem.get(item.item_id)}
                    </p>
                  ) : null}
                  {invalidItemIds.has(item.item_id) ? (
                    <p id={`item-score-error-${item.item_id}`} className="text-destructive text-xs" role="alert">
                      {tItemGrading('invalidItemScore', { max: format.number(item.max_score) })}
                    </p>
                  ) : null}
                  <MarkdownEditor
                    placeholder={tItemGrading('itemFeedback')}
                    value={entry?.feedback ?? item.feedback ?? ''}
                    disabled={!editable || isSaving}
                    preset="explanation"
                    minHeight={96}
                    onChange={markdown => patchItemDraft(item.item_id, 'feedback', markdown)}
                  />
                </div>
              )
            })}
          </div>

          {/* Override score option */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-3">
              <Switch
                id="override-score-switch"
                checked={overrideScore}
                onCheckedChange={checked => {
                  if (!checked && annulled) return
                  setOverrideScore(checked)
                  setDirty(true)
                }}
                disabled={!editable}
                aria-describedby={annulled ? 'override-score-annulled' : undefined}
              />
              <Label htmlFor="override-score-switch" className="text-sm">
                {tItemGrading('overrideScore')}
              </Label>
            </div>
            {annulled ? (
              <p id="override-score-annulled" className="text-muted-foreground text-xs">
                {tItemGrading('annulledOverrideHint')}
              </p>
            ) : null}
            {overrideScore && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={draft.score}
                    disabled={!editable || isSaving}
                    aria-label={tItemGrading('overrideScore')}
                    aria-invalid={finalScoreInvalid || undefined}
                    aria-describedby={finalScoreInvalid ? 'override-score-error' : undefined}
                    onChange={e => editDraft({ score: e.target.value })}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">{t('scoreOutOf100')}</span>
                </div>
                {finalScoreInvalid ? (
                  <p id="override-score-error" className="text-destructive text-xs" role="alert">
                    {t('invalidScore')}
                  </p>
                ) : null}
                <Input
                  placeholder={tItemGrading('overrideReason')}
                  value={overrideReason}
                  disabled={!editable || isSaving}
                  onChange={e => {
                    setOverrideReason(e.target.value)
                    setDirty(true)
                  }}
                />
              </div>
            )}
          </div>

          {/* Overall feedback */}
          <div className="space-y-2">
            <Label htmlFor="item-grade-overall-feedback" className="flex items-center gap-1.5">
              <MessageSquareText className="size-4" />
              {tItemGrading('overallFeedback')}
            </Label>
            <MarkdownEditor
              value={draft.feedback}
              disabled={!editable || isSaving}
              preset="explanation"
              minHeight={140}
              onChange={markdown => editDraft({ feedback: markdown })}
            />
          </div>

          {/* Action buttons */}
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving || remoteUpdate || !canSaveDraftNow || hasInvalidScore || !scaleReady}
              onClick={() => saveWithItemGrading('save')}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
              {tItemGrading('saveDraft')}
            </Button>
            <Button
              type="button"
              disabled={!editable || isSaving || remoteUpdate || !canPublishNow || hasInvalidScore || !scaleReady}
              onClick={() => saveWithItemGrading('publish')}
            >
              <Send className="size-4" />
              {isRepublish ? tItemGrading('republish') : tItemGrading('publish')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving || remoteUpdate || !canReturnNow || !scaleReady}
              onClick={() => saveWithItemGrading('return')}
            >
              <RotateCcw className="size-4" />
              {tItemGrading('returnForRevision')}
            </Button>
            {actionHint ? <p className="text-muted-foreground text-xs">{actionHint}</p> : null}
          </div>
        </div>
      ) : (
        /* ── Overall-score grading (no items — uses item-level endpoint) ── */
        <>
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="review-score">{t('finalScore')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="review-score"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={draft.score}
                disabled={!editable || isSaving}
                aria-invalid={finalScoreInvalid || undefined}
                aria-describedby={finalScoreInvalid ? 'review-score-error' : undefined}
                onChange={event => editDraft({ score: event.target.value })}
              />
              <span className="text-muted-foreground text-sm">{t('scoreOutOf100')}</span>
            </div>
            {finalScoreInvalid ? (
              <p id="review-score-error" className="text-destructive text-xs" role="alert">
                {t('invalidScore')}
              </p>
            ) : null}
            {submission.auto_score !== null && submission.auto_score !== undefined ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                disabled={!editable || isSaving || Number.parseFloat(draft.score) === submission.auto_score}
                onClick={() => editDraft({ score: String(submission.auto_score) })}
              >
                {t('useAutoScore')} {submission.auto_score}
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-feedback" className="flex items-center gap-1.5">
              <MessageSquareText className="size-4" />
              {t('feedback')}
            </Label>
            <MarkdownEditor
              value={draft.feedback}
              disabled={!editable || isSaving}
              preset="explanation"
              minHeight={160}
              onChange={markdown => editDraft({ feedback: markdown })}
            />
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving || remoteUpdate || !canSaveDraftNow || hasInvalidScore}
              onClick={() => saveOverallScore('GRADED')}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
              {t('saveDraftGrade')}
            </Button>
            <Button
              type="button"
              disabled={!editable || isSaving || remoteUpdate || !canPublishNow || hasInvalidScore}
              onClick={() => saveOverallScore('PUBLISHED')}
            >
              <Send className="size-4" />
              {isRepublish ? t('republishGrade') : t('publishGrade')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving || remoteUpdate || !canReturnNow}
              onClick={() => saveOverallScore('RETURNED')}
            >
              <RotateCcw className="size-4" />
              {t('returnForRevision')}
            </Button>
            {actionHint ? <p className="text-muted-foreground text-xs">{actionHint}</p> : null}
          </div>
        </>
      )}

      <div className="border-t pt-4">
        <SubmissionAIEntry
          submissionUuid={submissionUuid}
          hasFeedback={draft.feedback.trim() !== ''}
          onDraftFeedback={feedback => editDraft({ feedback })}
        />
      </div>

      {/* ── Keyboard legend ────────────────────────────────────────────── */}
      <div className="border-t pt-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Keyboard className="size-3.5" />
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('keyboardHintNextKey')}</kbd>{' '}
          {t('keyboardHintForward')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('keyboardHintPrevKey')}</kbd>{' '}
          {t('keyboardHintBackward')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('shortcutFocusGrade')}</kbd>{' '}
          {t('keyboardHintFocusGrade')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('shortcutSave')}</kbd>{' '}
          {t('keyboardHintSave')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('shortcutPublish')}</kbd>{' '}
          {t('keyboardHintPublish')}
        </div>
      </div>
    </aside>
  )
}

function KeyboardHint() {
  const t = useTranslations('Grading.Panel')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (readLocalStorageString('grading-review-keyboard-hint-seen') === '1') return
    writeLocalStorageString('grading-review-keyboard-hint-seen', '1')
    const openTimeout = globalThis.setTimeout(() => setOpen(true), 0)
    const timeout = globalThis.setTimeout(() => setOpen(false), 4500)
    return () => {
      globalThis.clearTimeout(openTimeout)
      globalThis.clearTimeout(timeout)
    }
  }, [])

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="size-7" />}>
          <Info className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('keyboardHint')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function buildOptimisticSubmission(
  submission: Submission,
  args: {
    assessmentUuid: string
    calculatedTotal: number | null
    draft: { score: string; feedback: string }
    gradedItems: GradedItem[]
    itemDrafts: Record<string, { score: string; feedback: string }>
    overrideReason: string
    status: 'save' | 'publish' | 'return'
    itemGrades: ItemGradeEntry[]
    finalScore: number | null
    scoreOverride: number | null
  },
): Submission {
  const nextStatus = args.status === 'publish' ? 'PUBLISHED' : args.status === 'return' ? 'RETURNED' : 'GRADED'
  const gradingJson = {
    ...submission.grading_json,
    feedback: args.draft.feedback,
    items: args.gradedItems.map(item => {
      const entry = args.itemDrafts[item.item_id]
      const rawScore = entry?.score ?? String(item.score)
      const parsed = Number.parseFloat(rawScore)
      return {
        ...item,
        score: Number.isNaN(parsed) ? item.score : Math.min(parsed, item.max_score),
        feedback: entry?.feedback ?? item.feedback ?? '',
      }
    }),
  }

  return {
    ...submission,
    status: nextStatus,
    final_score: args.finalScore ?? submission.final_score,
    score_override: args.scoreOverride,
    grading_json: gradingJson as GradingBreakdown,
    version: typeof submission.version === 'number' ? submission.version + 1 : submission.version,
  } as Submission
}
