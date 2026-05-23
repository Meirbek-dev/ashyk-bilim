'use client';

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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { canPublishGrade, canReturnSubmission, canTeacherEditGrade, getReleaseState } from '@/features/grading/domain';
import type { GradedItem, Submission, TeacherGradeInput } from '@/features/grading/domain';
import { StaleGradeError } from '@/services/grading/errors';
import { saveGradingDraft } from '@/services/assessments/assessment-actions';
import type { ItemGradeEntry } from '@/services/assessments/assessment-actions';
import { useGradingPanel } from '@/hooks/useGradingPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ReviewNavigationState } from '../types';

interface GradeDraft {
  score: string;
  feedback: string;
}

interface ItemDraftEntry {
  score: string;
  feedback: string;
}

export default function GradeForm({
  submissionUuid,
  assessmentUuid,
  onSaved,
  navigation,
}: {
  submissionUuid: string | null;
  assessmentUuid?: string;
  onSaved: () => Promise<void>;
  navigation: ReviewNavigationState;
}) {
  const { submission, isLoading, mutate } = useGradingPanel(submissionUuid, assessmentUuid);
  const t = useTranslations('Grading.Panel');
  const tItemGrading = useTranslations('ItemGrading');
  const [draft, setDraft] = useState<GradeDraft>({ score: '', feedback: '' });
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraftEntry>>({});
  const [overrideScore, setOverrideScore] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSaving, startSaving] = useTransition();
  const [staleDraft, setStaleDraft] = useState<{ server: Submission; local: GradeDraft } | null>(null);

  // Items from grading breakdown — may be empty for manual-only assessments
  const gradedItems: GradedItem[] = useMemo(() => {
    return submission?.grading_json?.items ?? [];
  }, [submission?.grading_json?.items]);

  const hasItemGrading = gradedItems.length > 0 && Boolean(assessmentUuid);

  // Calculated total from item drafts (0 to sum of max_scores)
  const calculatedTotal = useMemo(() => {
    if (!hasItemGrading) return null;
    return gradedItems.reduce((acc, item) => {
      const raw = itemDrafts[item.item_id]?.score ?? String(item.score);
      const val = Number.parseFloat(raw);
      return acc + (Number.isNaN(val) ? 0 : Math.min(val, item.max_score));
    }, 0);
  }, [hasItemGrading, gradedItems, itemDrafts]);

  const maxPossible = useMemo(() => gradedItems.reduce((acc, item) => acc + item.max_score, 0), [gradedItems]);

  const editable = submission ? canTeacherEditGrade(submission.status) : false;

  // Ctrl+Enter saves draft; Ctrl+Shift+Enter publishes
  const handleCtrlEnter = useCallback(
    (event: KeyboardEvent) => {
      if (!editable || isSaving) return;
      const isCtrl = event.ctrlKey || event.metaKey;
      if (!isCtrl || event.key !== 'Enter') return;
      event.preventDefault();
      if (hasItemGrading) {
        saveWithItemGrading(event.shiftKey ? 'publish' : 'save');
      } else {
        saveOverallScore(event.shiftKey ? 'PUBLISHED' : 'GRADED');
      }
    },
    [editable, isSaving, hasItemGrading, saveWithItemGrading, saveOverallScore],
  );

  useEffect(() => {
    globalThis.addEventListener('keydown', handleCtrlEnter);
    return () => globalThis.removeEventListener('keydown', handleCtrlEnter);
  }, [handleCtrlEnter]);

  useEffect(() => {
    // Sync overall draft from server
    setDraft({
      score:
        submission?.final_score !== null && submission?.final_score !== undefined ? String(submission.final_score) : '',
      feedback: submission?.grading_json?.feedback ?? '',
    });
    setStaleDraft(null);
    setOverrideScore(false);
    setOverrideReason('');

    // Sync per-item drafts from grading_json.items
    if (submission?.grading_json?.items) {
      const next: Record<string, ItemDraftEntry> = {};
      for (const item of submission.grading_json.items) {
        next[item.item_id] = { score: String(item.score), feedback: item.feedback ?? '' };
      }
      setItemDrafts(next);
    } else {
      setItemDrafts({});
    }
  }, [submission?.final_score, submission?.grading_json, submission?.submission_uuid]);

  const patchItemDraft = (itemId: string, field: keyof ItemDraftEntry, value: string) => {
    setItemDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        score: prev[itemId]?.score ?? '0',
        feedback: prev[itemId]?.feedback ?? '',
        [field]: value,
      },
    }));
  };

  // New item-level save (via unified assessment API)
  const saveWithItemGrading = useCallback((status: 'save' | 'publish' | 'return') => {
    if (!submission || !assessmentUuid) return;

    const itemGrades: ItemGradeEntry[] = gradedItems.map((item) => {
      const entry = itemDrafts[item.item_id];
      const rawScore = entry?.score ?? String(item.score);
      const parsed = Number.parseFloat(rawScore);
      return {
        item_uuid: item.item_id,
        score: Number.isNaN(parsed) ? 0 : Math.min(parsed, item.max_score),
        feedback: entry?.feedback ?? item.feedback ?? '',
        is_manual: true,
      };
    });

    const finalScore = overrideScore ? Number.parseFloat(draft.score) : undefined;
    if (overrideScore && (Number.isNaN(finalScore!) || finalScore! < 0 || finalScore! > 100)) {
      toast.error(t('invalidScore'));
      return;
    }

    startSaving(async () => {
      try {
        await saveGradingDraft(
          assessmentUuid,
          submission.submission_uuid,
          {
            item_grades: itemGrades,
            overall_feedback: draft.feedback,
            status,
            override_score: overrideScore ? true : undefined,
            final_score: overrideScore ? finalScore : undefined,
            override_reason: overrideScore ? overrideReason : undefined,
          },
          submission.version,
        );
        toast.success(
          status === 'publish'
            ? tItemGrading('toasts.published')
            : status === 'return'
              ? tItemGrading('toasts.returned')
              : tItemGrading('toasts.saved'),
        );
        setStaleDraft(null);
        await Promise.all([mutate(), onSaved()]);
      } catch (error) {
        if (error instanceof StaleGradeError) {
          setStaleDraft({ server: error.serverSubmission, local: draft });
          await mutate();
        } else {
          toast.error(tItemGrading('toasts.failed'));
        }
      }
    });
  }, [submission, assessmentUuid, gradedItems, itemDrafts, overrideScore, draft, t, startSaving, overrideReason, tItemGrading, onSaved, mutate]);

  // All grading now goes through the item-level GradingDraftSave endpoint.
  // The legacy overall-score-only path has been removed.
  const saveOverallScore = useCallback((status: TeacherGradeInput['status']) => {
    // Redirect to item-level grading with a single "overall" item
    saveWithItemGrading(status === 'PUBLISHED' ? 'publish' : status === 'RETURNED' ? 'return' : 'save');
  }, [saveWithItemGrading]);

  if (!submissionUuid) {
    return <aside className="text-muted-foreground p-4 text-sm">{t('selectSubmission')}</aside>;
  }

  if (isLoading && !submission) {
    return (
      <aside className="text-muted-foreground flex items-center justify-center p-4 text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loadingSubmission')}
      </aside>
    );
  }

  if (!submission) {
    return <aside className="text-muted-foreground p-4 text-sm">{t('formUnavailable')}</aside>;
  }

  const canPublishNow = canPublishGrade(submission.status);
  const canReturnNow = canReturnSubmission(submission.status);
  const releaseState =
    'release_state' in submission && submission.release_state
      ? submission.release_state
      : getReleaseState(submission.status);

  return (
    <aside className="space-y-5 p-4 xl:sticky xl:top-0 xl:h-[calc(100vh-96px)] xl:overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('grade')}</h2>
          <KeyboardHint />
        </div>
        <p className="text-muted-foreground text-sm">{t('gradeDescription')}</p>
      </div>

      <Alert>
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

      {/* ── OCC stale-grade banner ─────────────────────────────────────── */}
      {staleDraft ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('staleDraftTitle')}</AlertTitle>
          <AlertDescription className="mt-1 space-y-1 text-xs">
            <p>
              {t('staleDraft.serverScoreLabel')} <strong>{staleDraft.server.final_score ?? '—'}</strong>.{' '}
              {t('staleDraft.yourDraftLabel')} <strong>{staleDraft.local.score}</strong>.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => {
                  const s = staleDraft.server;
                  setDraft({
                    score: s.final_score !== null && s.final_score !== undefined ? String(s.final_score) : '',
                    feedback: s.grading_json?.feedback ?? '',
                  });
                  setStaleDraft(null);
                }}
              >
                {t('useServerValues')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => setStaleDraft(null)}
              >
                {t('keepMyDraft')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!navigation.hasPrevious}
          onClick={navigation.goPrevious}
        >
          <ChevronLeft className="size-4" />
          {t('previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!navigation.hasNext}
          onClick={navigation.goNext}
        >
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
                  earned: calculatedTotal.toFixed(1),
                  possible: maxPossible,
                  percentage: maxPossible > 0 ? Math.round((calculatedTotal / maxPossible) * 100) : 0,
                })}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {gradedItems.map((item, idx) => {
              const entry = itemDrafts[item.item_id];
              return (
                <div
                  key={item.item_id}
                  className="bg-muted/30 space-y-2 rounded-md border p-3"
                >
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
                      className="w-20"
                      onChange={(e) => patchItemDraft(item.item_id, 'score', e.target.value)}
                    />
                    <span className="text-muted-foreground text-xs">/ {item.max_score}</span>
                    {item.needs_manual_review && (
                      <span className="ml-auto text-xs text-amber-600">{t('needsReview')}</span>
                    )}
                  </div>
                  <Textarea
                    placeholder={tItemGrading('itemFeedback')}
                    value={entry?.feedback ?? item.feedback ?? ''}
                    disabled={!editable || isSaving}
                    className="min-h-16 text-sm"
                    onChange={(e) => patchItemDraft(item.item_id, 'feedback', e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          {/* Override score option */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-3">
              <Switch
                id="override-score-switch"
                checked={overrideScore}
                onCheckedChange={setOverrideScore}
                disabled={!editable}
              />
              <Label
                htmlFor="override-score-switch"
                className="text-sm"
              >
                {tItemGrading('overrideScore')}
              </Label>
            </div>
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
                    onChange={(e) => setDraft((cur) => ({ ...cur, score: e.target.value }))}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">/100</span>
                </div>
                <Input
                  placeholder={tItemGrading('overrideReason')}
                  value={overrideReason}
                  disabled={!editable || isSaving}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Overall feedback */}
          <div className="space-y-2">
            <Label
              htmlFor="item-grade-overall-feedback"
              className="flex items-center gap-1.5"
            >
              <MessageSquareText className="size-4" />
              {tItemGrading('overallFeedback')}
            </Label>
            <Textarea
              id="item-grade-overall-feedback"
              value={draft.feedback}
              disabled={!editable || isSaving}
              className="min-h-24"
              onChange={(e) => setDraft((cur) => ({ ...cur, feedback: e.target.value }))}
            />
          </div>

          {/* Action buttons */}
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving}
              onClick={() => saveWithItemGrading('save')}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
              {tItemGrading('saveDraft')}
            </Button>
            <Button
              type="button"
              disabled={!editable || isSaving || !canPublishNow}
              onClick={() => saveWithItemGrading('publish')}
            >
              <Send className="size-4" />
              {tItemGrading('publish')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving || !canReturnNow}
              onClick={() => saveWithItemGrading('return')}
            >
              <RotateCcw className="size-4" />
              {tItemGrading('returnForRevision')}
            </Button>
            {!canPublishNow ? <p className="text-muted-foreground text-xs">{t('publishPrerequisite')}</p> : null}
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
                onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))}
              />
              <span className="text-muted-foreground text-sm">/100</span>
            </div>
            {submission.auto_score !== null && submission.auto_score !== undefined ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                disabled={!editable || isSaving || Number.parseFloat(draft.score) === submission.auto_score}
                onClick={() => setDraft((current) => ({ ...current, score: String(submission.auto_score) }))}
              >
                {t('useAutoScore')} {submission.auto_score}
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="review-feedback"
              className="flex items-center gap-1.5"
            >
              <MessageSquareText className="size-4" />
              {t('feedback')}
            </Label>
            <Textarea
              id="review-feedback"
              value={draft.feedback}
              disabled={!editable || isSaving}
              className="min-h-36"
              onChange={(event) => setDraft((current) => ({ ...current, feedback: event.target.value }))}
            />
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving}
              onClick={() => saveOverallScore('GRADED')}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
              {t('saveDraftGrade')}
            </Button>
            <Button
              type="button"
              disabled={!editable || isSaving || !canPublishNow}
              onClick={() => saveOverallScore('PUBLISHED')}
            >
              <Send className="size-4" />
              {t('publishGrade')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editable || isSaving || !canReturnNow}
              onClick={() => saveOverallScore('RETURNED')}
            >
              <RotateCcw className="size-4" />
              {t('returnForRevision')}
            </Button>
            {!canPublishNow ? <p className="text-muted-foreground text-xs">{t('publishPrerequisite')}</p> : null}
          </div>
        </>
      )}

      {/* ── Keyboard legend ────────────────────────────────────────────── */}
      <div className="border-t pt-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Keyboard className="size-3.5" />
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('keyboardHintNextKey')}</kbd>{' '}
          {t('keyboardHintForward')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('keyboardHintPrevKey')}</kbd>{' '}
          {t('keyboardHintBackward')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('shortcutFocusGrade')}</kbd> {t('keyboardHintFocusGrade')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('shortcutSave')}</kbd> {t('keyboardHintSave')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('shortcutPublish')}</kbd> {t('keyboardHintPublish')}
        </div>
      </div>
    </aside>
  );
}

function KeyboardHint() {
  const t = useTranslations('Grading.Panel');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (globalThis.localStorage.getItem('grading-review-keyboard-hint-seen') === '1') return;
    setOpen(true);
    globalThis.localStorage.setItem('grading-review-keyboard-hint-seen', '1');
    const timeout = globalThis.setTimeout(() => setOpen(false), 4500);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip
        open={open}
        onOpenChange={setOpen}
      >
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
            />
          }
        >
          <Info className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('keyboardHint')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
